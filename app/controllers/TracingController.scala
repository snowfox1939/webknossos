package controllers

import play.api.Logger
import play.api.libs.json.Json._
import play.api.libs.json._
import nml.BranchPoint
import play.api.mvc._
import org.bson.types.ObjectId
import brainflight.tools.Math._
import brainflight.security.Secured
import brainflight.tools.geometry.Vector3I
import brainflight.tools.geometry.Vector3I._
import models.user.User
import models.security._
import models.tracing.Tracing
import play.api.libs.iteratee.Concurrent
import play.api.libs.iteratee.Iteratee
import play.api.libs.iteratee.Concurrent.Channel
import play.api.libs.iteratee.Input
import play.api.libs.iteratee.Done
import play.api.libs.iteratee.Enumerator
import play.api.libs.Comet
import models.binary.DataSet
import nml.Node
import nml.Edge
import brainflight.tools.geometry.Point3D
import models.tracing.UsedTracings
import models.user.TimeTracking
import brainflight.view.helpers._
import models.task.Task
import views._
import play.api.i18n.Messages
import models.tracing.UsedTracings

object TracingController extends Controller with Secured {
  override val DefaultAccessRole = Role.User

  def createDataSetInformation(dataSetName: String) =
    DataSet.findOneByName(dataSetName) match {
      case Some(dataSet) =>
        Json.obj(
          "dataSet" -> Json.obj(
            "id" -> dataSet.id,
            "name" -> dataSet.name,
            "dataLayers" -> Json.toJson(dataSet.dataLayers.map {
              case (id, layer) =>
                id -> Json.obj(
                  "resolutions" -> layer.supportedResolutions)
            }),
            "upperBoundary" -> dataSet.maxCoordinates))
      case _ =>
        Json.obj("error" -> "Couldn't find dataset.")
    }

  def createTracingInformation(tracing: Tracing) = {
    Json.obj(
      "tracing" -> tracing)
  }

  def createTracingsList(user: User) = {
    for {
      tracing <- Tracing.findFor(user)
    } yield {
      Json.obj(
        "name" -> (tracing.dataSetName + "  " + formatDate(tracing.date)),
        "id" -> tracing.id,
        "isNew" -> false)
    }
  }

  def createNewTracingList() = {
    DataSet.findAll.map(d => Json.obj(
      "name" -> ("New on " + d.name),
      "id" -> d.id,
      "isNew" -> true))
  }

  def createExplorational = Authenticated(parser = parse.urlFormEncoded) { implicit request =>
    (for {
      dataSetId <- request.body.get("dataSetId").flatMap(_.headOption)
      dataSet <- DataSet.findOneById(dataSetId)
    } yield {
      val tracing = Tracing.createTracingFor(request.user, dataSet)
      UsedTracings.use(request.user, tracing)
      Redirect(routes.Game.index)
    }) getOrElse BadRequest("Couldn't find DataSet.")
  }

  def list = Authenticated { implicit request =>
    Ok(Json.toJson(createNewTracingList ++ createTracingsList(request.user)))
  }

  def info(tracingId: String) = Authenticated { implicit request =>
    Tracing
      .findOneById(tracingId)
      .filter(_._user == request.user._id)
      .map(tracing =>
        Ok(createTracingInformation(tracing) ++
          createDataSetInformation(tracing.dataSetName)))
      .getOrElse(BadRequest("Tracing with id '%s' not found.".format(tracingId)))
  }

  def update(tracingId: String, version: Int) = Authenticated(parse.json(maxLength = 2097152)) { implicit request =>
    Tracing
      .findOneById(tracingId)
      .filter(_._user == request.user._id).map { oldTracing =>
        if (version == oldTracing.version + 1) {
          (request.body) match {
            case JsArray(jsUpdates) =>
              val updates = jsUpdates.flatMap { Tracing.createUpdateFromJson }
              if (jsUpdates.size == updates.size) {
                val tracing = updates.foldLeft(oldTracing) {
                  case (tracing, updater) => updater.update(tracing)
                }
                Tracing.save(tracing.copy(timestamp = System.currentTimeMillis, version = version))
                TimeTracking.logUserAction(request.user, tracing)
                AjaxOk.success(Json.obj("version" -> version), "tracing.saved")
              } else {
                AjaxBadRequest.error("Invalid update Json")
              }
            case _ =>
              Logger.error("Invalid update json.")
              AjaxBadRequest.error("Invalid update Json")
          }
        } else
          AjaxBadRequest.error(createTracingInformation(oldTracing), "tracing.dirtyState")
      }
      .getOrElse(AjaxBadRequest.error("Update for tracing with id '%s' failed.".format(tracingId)))
  }

  private def finishTracing(user: User, tracingId: String): Either[String, (Tracing, String)] = {
    def finishTask(tracing: Tracing, message: String) = {
      tracing.taskId.flatMap(Task.findOneById).map { task =>
        UsedTracings.removeAll(user)
        Right((tracing, message))
      } getOrElse (Right(tracing, Messages("tracing.finished")))
    }

    Tracing
      .findOneById(tracingId)
      .filter(tracing => tracing._user == user._id && tracing.state.isInProgress)
      .map { tracing =>
        if (tracing.isTrainingsTracing) {
          finishTask(tracing.update(_.passToReview), Messages("task.passedToReview"))
        } else {
          finishTask(tracing.update(_.finish), Messages("task.finished"))
        }
      }
      .getOrElse(Left(Messages("tracing.notFound")))
  }

  def finish(tracingId: String, experimental: Boolean) = Authenticated { implicit request =>
    finishTracing(request.user, tracingId).fold(
      error => AjaxBadRequest.error(error),
      {
        case (tracing, message) =>
          if (experimental)
            AjaxOk.success(message)
          else
            tracing
              .taskId
              .flatMap(Task.findOneById)
              .map { task =>
                AjaxOk.success(html.user.dashboard.taskTracingTableItem(task, tracing), message)
              }
              .getOrElse(AjaxBadRequest.error("task.notfound"))
      })
  }

  def finishWithRedirect(tracingId: String) = Authenticated { implicit request =>
    finishTracing(request.user, tracingId).fold(
      error =>
        BadRequest(error),
      {
        case (_, message) =>
          Redirect(routes.UserController.dashboard).flashing("success" -> message)
      })
  }

}
