package controllers

import javax.inject.Inject

import scala.async.Async._
import scala.concurrent._
import scala.concurrent.duration._

import akka.util.Timeout
import com.scalableminds.util.mvc.JsonResult
import com.scalableminds.util.reactivemongo.{DBAccessContext, GlobalAccessContext}
import com.scalableminds.util.tools.ExtendedTypes.ExtendedBoolean
import com.scalableminds.util.tools.Fox
import models.annotation.{Annotation, _}
import models.binary.DataSetDAO
import models.task.TaskDAO
import models.user.time._
import models.user.{UsedAnnotationDAO, User, UserDAO}
import net.liftweb.common.{Full, _}
import oxalis.annotation.AnnotationIdentifier
import oxalis.security.{AuthenticatedRequest, Secured}
import play.api.Logger
import play.api.i18n.{Messages, MessagesApi}
import play.api.libs.concurrent.Execution.Implicits._
import play.api.libs.iteratee.Enumerator
import play.api.libs.json.{JsArray, JsObject, _}
import play.twirl.api.Html

/**
 * Company: scalableminds
 * User: tmbo
 * Date: 01.06.13
 * Time: 02:09
 */
class AnnotationController @Inject()(val messagesApi: MessagesApi) extends Controller with Secured with TracingInformationProvider {

  implicit val timeout = Timeout(5 seconds)

  def annotationJson(user: User, annotation: AnnotationLike, exclude: List[String])(implicit ctx: DBAccessContext): Fox[JsObject] =
    AnnotationLike.annotationLikeInfoWrites(annotation, Some(user), exclude)

  def info(typ: String, id: String, readOnly: Boolean = false) = UserAwareAction.async { implicit request =>
    val annotationId = AnnotationIdentifier(typ, id)

    withAnnotation(annotationId) { annotation =>
        for {
          js <- tracingInformation(annotation, readOnly)
        } yield {
          request.userOpt.foreach { user =>
            UsedAnnotationDAO.use(user, annotationId)
            TimeSpanService.logUserInteraction(user, Some(annotation))            // log time when a user starts working
          }
          Ok(js)
        }
    }
  }

  def infoReadOnly(typ: String, id: String) = info(typ, id, readOnly = true)

  def merge(typ: String, id: String, mergedTyp: String, mergedId: String, readOnly: Boolean) = Authenticated.async { implicit request =>
    withMergedAnnotation(typ, id, mergedId, mergedTyp, readOnly) { annotation =>
      for {
        _ <- annotation.restrictions.allowAccess(request.user) ?~> Messages("notAllowed") ~> BAD_REQUEST
        temporary <- annotation.temporaryDuplicate(keepId = true)
        explorational = temporary.copy(typ = AnnotationType.Explorational)
        savedAnnotation <- explorational.saveToDB
        json <- annotationJson(request.user, savedAnnotation, exclude = Nil)
      } yield {
        //Redirect(routes.AnnotationController.trace(savedAnnotation.typ, savedAnnotation.id))
        JsonOk(json, Messages("annotation.merge.success"))
      }
    }
  }

  def trace(typ: String, id: String) = Authenticated { implicit request =>
    Ok(empty)
  }

  // DISABLED: Due to changes in the json update protocol we are currently unable to parse all previous
  // json updates and hence we can not use them to replay previous updates. It is also infeasible to write
  // an evolution for this since it is to expensive to calculate the missing information to create the proper updates

  // def combineUpdates(updates: List[AnnotationUpdate]) = updates.foldLeft(Seq.empty[JsValue]){
  //   case (updates, AnnotationUpdate(_, _, _, JsArray(nextUpdates), _)) =>
  //     updates ++ nextUpdates
  //   case (updates, u) =>
  //     Logger.warn("dropping update during replay! Update: " + u)
  //     updates
  // }

  // def listUpdates(typ: String, id: String)= Authenticated.async { implicit request =>
  //   withAnnotation(AnnotationIdentifier(typ, id)) { annotation =>
  //     for {
  //       updates <- AnnotationUpdateService.retrieveAll(typ, id, limit = Some(100))
  //       combinedUpdate = JsArray(combineUpdates(updates))
  //     } yield Ok(combinedUpdate)
  //   }
  // }

  // def transferUpdates(typ: String, id: String, fromId: String, fromTyp: String, maxVersion: Int) = Authenticated.async { implicit request =>
  //   def applyUpdates(updates: List[AnnotationUpdate], targetAnnotation: AnnotationLike): Fox[AnnotationLike] = {
  //     updates.splitAt(100) match {
  //       case (Nil, _) =>
  //         Fox.successful(targetAnnotation)
  //       case (first, last) =>
  //         val combinedUpdate = combineUpdates(first)
  //         targetAnnotation.muta.updateFromJson(combinedUpdate).flatMap{ updated =>
  //           applyUpdates(last, updated)
  //         }
  //     }
  //   }

  //   for {
  //     targetAnnotation <- findAnnotation(typ, id)
  //     _ <- isUpdateAllowed(targetAnnotation, targetAnnotation.version + 1).toFox
  //     _ <- findAnnotation(fromTyp, fromId)
  //     updates <- AnnotationUpdateService.retrieveAll(fromTyp, fromId, maxVersion).toFox
  //     result <- applyUpdates(updates, targetAnnotation)
  //   } yield JsonOk(Messages("annotation.updates.transfered"))
  // }

  // def revert(typ: String, id: String, version: Int) = Authenticated.async { implicit request =>
  //   for {
  //     oldAnnotation <- findAnnotation(typ, id)
  //     _ <- isUpdateAllowed(oldAnnotation, version).toFox
  //     updates <- AnnotationUpdateService.retrieveAll(typ, id, maxVersion=version)
  //     combinedUpdate = JsArray(combineUpdates(updates))
  //     updateableAnnotation <- isUpdateable(oldAnnotation) ?~> Messages("annotation.update.impossible")
  //     updatedAnnotation <- oldAnnotation.muta.resetToBase()
  //     result <- handleUpdates(updateableAnnotation, combinedUpdate, version)
  //     _ <- AnnotationUpdateService.removeAll(typ, id, aboveVersion = version)
  //   } yield {
  //     Logger.info(s"REVERTED using update [$typ - $id, $version]: $combinedUpdate")
  //     JsonOk(result, "annotation.reverted")
  //   }
  // }

  def reset(typ: String, id: String) = Authenticated.async { implicit request =>
    withAnnotation(AnnotationIdentifier(typ, id)) { annotation =>
      for {
        _ <- ensureTeamAdministration(request.user, annotation.team)
        reset <- annotation.muta.resetToBase() ?~> Messages("annotation.reset.failed")
        json <- annotationJson(request.user, reset,  List("content"))
      } yield {
        JsonOk(json, Messages("annotation.reset.success"))
      }
    }
  }

  def reopen(typ: String, id: String) = Authenticated.async { implicit request =>
    // Reopening an annotation is allowed if either the user owns the annotation or the user is allowed to administrate
    // the team the annotation belongs to
    def isReopenAllowed(user: User, annotation: AnnotationLike) = {
       annotation._user.contains(user._id) || user.adminTeams.exists(_.team == annotation.team)
    }

    withAnnotation(AnnotationIdentifier(typ, id)) { annotation =>
      for {
        _ <- isReopenAllowed(request.user, annotation) ?~> "reopen.notAllowed"
        reopenedAnnotation <- annotation.muta.reopen() ?~> "annotation.invalid"
        json <- annotationJson(request.user, reopenedAnnotation,  List("content"))
      } yield {
        JsonOk(json, Messages("annotation.reopened"))
      }
    }
  }

  def download(typ: String, id: String) = Authenticated.async { implicit request =>
    withAnnotation(AnnotationIdentifier(typ, id)) {
      annotation =>
        for {
          name <- nameAnnotation(annotation) ?~> Messages("annotation.name.impossible")
          _ <- annotation.restrictions.allowDownload(request.user) ?~> Messages("annotation.download.notAllowed")
          annotationDAO <- AnnotationDAO.findOneById(id) ?~> Messages("annotation.notFound")
          content <- annotation.content ?~> Messages("annotation.content.empty")
          stream <- content.toDownloadStream
        } yield {
          Ok.chunked(stream.andThen(Enumerator.eof[Array[Byte]])).withHeaders(
            CONTENT_TYPE ->
              "application/octet-stream",
            CONTENT_DISPOSITION ->
              s"filename=${'"'}${name + content.downloadFileExtension}${'"'}")
        }
    }
  }

  def createExplorational = Authenticated.async(parse.urlFormEncoded) { implicit request =>
    for {
      dataSetName <- postParameter("dataSetName") ?~> Messages("dataSet.notSupplied")
      dataSet <- DataSetDAO.findOneBySourceName(dataSetName) ?~> Messages("dataSet.notFound", dataSetName)
      contentType <- postParameter("contentType") ?~> Messages("annotation.contentType.notSupplied")
      annotation <- AnnotationService.createExplorationalFor(request.user, dataSet, contentType) ?~> Messages("annotation.create.failed")
    } yield {
      Redirect(routes.AnnotationController.trace(annotation.typ, annotation.id))
    }
  }

  def handleUpdates(annotation: Annotation, js: JsValue, version: Int)(implicit request: AuthenticatedRequest[_]): Fox[JsObject] = {
    js match {
      case JsArray(jsUpdates) =>
        for {
          updated <- annotation.muta.updateFromJson(jsUpdates) //?~> Messages("format.json.invalid")
        } yield {
          TimeSpanService.logUserInteraction(request.user, Some(updated))
          Json.obj("version" -> version)
        }
      case t                  =>
        Logger.info("Failed to handle json update. Tried: " + t)
        Failure(Messages("format.json.invalid"))
    }
  }

  def isUpdateable(annotationLike: AnnotationLike) = {
    annotationLike match {
      case a: Annotation => Some(a)
      case _             => None
    }
  }

  def isUpdateAllowed(annotation: AnnotationLike, version: Int)(implicit request: AuthenticatedRequest[_]) = {
    if (annotation.restrictions.allowUpdate(request.user))
      Full(version == annotation.version + 1)
    else
      Failure(Messages("notAllowed")) ~> FORBIDDEN
  }

  def executeUpdateIfAllowed(oldAnnotation: Annotation, isAllowed: Boolean, updates: JsValue, version: Int, user: User)(implicit request: AuthenticatedRequest[_]) = {
    if (isAllowed)
      for {
        result <- handleUpdates(oldAnnotation, updates, version)
      } yield {
        JsonOk(result, "annotation.saved")
      }
    else {
      for {
        oldJs <- oldAnnotation.annotationInfo(Some(user))
      } yield {
        new JsonResult(CONFLICT)(oldJs, Messages("annotation.dirtyState"))
      }
    }
  }

  def updateWithJson(typ: String, id: String, version: Int) = Authenticated.async(parse.json(maxLength = 2097152)) { implicit request =>
    // Logger.info(s"Tracing update [$typ - $id, $version]: ${request.body}")
    AnnotationUpdateService.store(typ, id, version, request.body)

    for {
      oldAnnotation <- findAnnotation(typ, id)
      updateableAnnotation <- isUpdateable(oldAnnotation) ?~> Messages("annotation.update.impossible")
      isAllowed <- isUpdateAllowed(oldAnnotation, version).toFox
      result <- executeUpdateIfAllowed(updateableAnnotation, isAllowed, request.body, version, request.user)
    } yield {
      result
    }
  }

  def finishAnnotation(typ: String, id: String, user: User)(implicit ctx: DBAccessContext): Fox[(JsObject, String)] = {
    for {
      annotation <- AnnotationDAO.findOneById(id) ?~> Messages("annotation.notFound")
      (updated, message) <- annotation.muta.finishAnnotation(user)
      json <- annotationJson(user, updated,  List("content"))
    } yield {
      TimeSpanService.logUserInteraction(user, Some(annotation))         // log time on a tracings end
      (json, message)
    }
  }

  def finish(typ: String, id: String) = Authenticated.async { implicit request =>
    for {
      (json, message) <- finishAnnotation(typ, id, request.user)(GlobalAccessContext)
    } yield {
      JsonOk(json, Messages(message))
    }
  }

  def finishAll(typ: String) = Authenticated.async(parse.json) { implicit request =>
    withJsonAs[JsArray](request.body \ "annotations") { annotationIds =>
      val results: List[Fox[(JsObject, String)]] = (for {
        jsValue <- annotationIds.value
        id <- jsValue.asOpt[String]
      } yield finishAnnotation(typ, id, request.user)(GlobalAccessContext)).toList

      Fox.sequence(results) map { results =>
        JsonOk(Messages("annotation.allFinished"))
      }
    }
  }

  def finishWithRedirect(typ: String, id: String) = Authenticated.async { implicit request =>
    val redirectTarget = if(!request.user.isAnonymous) "/dashboard" else "/thankyou"

    for {
      annotation <- AnnotationDAO.findOneById(id) ?~> Messages("annotation.notFound")
      finished <- annotation.muta.finishAnnotation(request.user).futureBox
    } yield {
      finished match {
        case Full((_, message)) =>
          Redirect(redirectTarget).flashing("success" -> message)
        case Failure(message, _, _) =>
          Redirect(redirectTarget).flashing("error" -> message)
        case _ =>
          Redirect(redirectTarget).flashing("error" -> Messages("error.unknown"))
      }
    }
  }

  def nameExplorativeAnnotation(typ: String, id: String) = Authenticated.async(parse.urlFormEncoded) { implicit request =>
    for {
      annotation <- AnnotationDAO.findOneById(id) ?~> Messages("annotation.notFound")
      name <- postParameter("name") ?~> Messages("annotation.invalidName")
      updated <- annotation.muta.rename(name)
      renamedJSON <- Annotation.transformToJson(updated)
    } yield {
      JsonOk(
        Json.obj("annotations" -> renamedJSON),
        Messages("annotation.setName"))
    }
  }

  def empty(implicit request: AuthenticatedRequest[_]) = {
    views.html.main()(Html(""))
  }

  def annotationsForTask(taskId: String) = Authenticated.async { implicit request =>
    for {
      task <- TaskDAO.findOneById(taskId) ?~> Messages("task.notFound")
      _ <- ensureTeamAdministration(request.user, task.team)
      annotations <- task.annotations
      jsons <- Fox.sequence(annotations.map(annotationJson(request.user, _, exclude = List("content"))))
    } yield {
      Ok(JsArray(jsons.flatten))
    }
  }

  def cancel(typ: String, id: String) = Authenticated.async { implicit request =>
    def tryToCancel(annotation: AnnotationLike) = async {
      annotation match {
        case t if t.typ == AnnotationType.Task =>
          await(annotation.muta.cancelTask().futureBox).map { _ =>
            Ok
          }
        case _                                 =>
          Full(JsonOk(Messages("annotation.finished")))
      }
    }
    withAnnotation(AnnotationIdentifier(typ, id)) { annotation =>
      for {
        _ <- ensureTeamAdministration(request.user, annotation.team)
        result <- tryToCancel(annotation)
      } yield {
        UsedAnnotationDAO.removeAll(AnnotationIdentifier(typ, id))
        result
      }
    }
  }

  def transfer(typ: String, id: String) = Authenticated.async(parse.json) { implicit request =>
    for {
      annotation <- AnnotationDAO.findOneById(id) ?~> Messages("annotation.notFound")
      userId <- (request.body \ "userId").asOpt[String].toFox
      user <- UserDAO.findOneById(userId) ?~> Messages("user.notFound")
      result <- annotation.muta.transferToUser(user)
    } yield {
      Ok
    }
  }
}
