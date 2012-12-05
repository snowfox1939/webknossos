package controllers.admin

import play.mvc.Security.Authenticated
import brainflight.security.Secured
import models.security.Role
import controllers.Controller
import views._
import models.knowledge.Level
import play.api.data.Form
import play.api.data.Forms.mapping
import play.api.data.Forms.number
import play.api.data.Forms.text
import play.api.i18n.Messages

object LevelCreator extends Controller with Secured {
  override def DefaultAccessRole = Role.Admin

  val levelForm = Form(
    mapping(
      "name" -> text.verifying("level.invalidName", Level.isValidLevelName _))(Level.fromForm)(Level.toForm))

  def use(levelName: String) = Authenticated { implicit request =>
    Level
      .findOneByName(levelName)
      .map { level =>
        Ok(html.admin.creator.levelCreator(level))
      }
      .getOrElse(BadRequest("Level not found."))
  }

  def delete(levelName: String) = Authenticated { implicit request =>
    Level
      .findOneByName(levelName)
      .map { level =>
        Level.remove(level)
        AjaxOk.success(Messages("level.removed"))
      }
      .getOrElse(AjaxBadRequest.error("Level not found."))
  }

  
  def uploadAsset(levelName: String) = Authenticated(parse.multipartFormData) { implicit request =>
    request.body.file("asset").flatMap { assetFile =>
      Level.findOneByName(levelName).map { level =>
        if (level.addAsset(assetFile.filename, assetFile.ref.file))
          Ok
        else
          BadRequest("Could not upload.")
      }
    } getOrElse BadRequest("Invalid request or level.")
  }

  def listAssets(levelName: String) = Authenticated { implicit request =>
    Level
      .findOneByName(levelName)
      .map { level =>
        Ok(level.assets.map(_.getName).mkString(", "))
      }
      .getOrElse(BadRequest("Level not found."))
  }

  def retrieveAsset(levelName: String, asset: String) = Authenticated { implicit request =>
    Level
      .findOneByName(levelName)
      .map { level =>
        level.retrieveAsset(asset) match {
          case Some(assetFile) =>
            Ok.sendFile(assetFile, true)
          case _ =>
            BadRequest("Asset not found.")
        }
      }
      .getOrElse(BadRequest("Level not found."))
  }

  def deleteAsset(levelName: String, asset: String) = Authenticated { implicit request =>
    Level
      .findOneByName(levelName)
      .map { level =>
        level.deleteAsset(asset) match {
          case true =>
            Ok
          case _ =>
            BadRequest("Asset not found.")
        }
      }
      .getOrElse(BadRequest("Level not found."))
  }

  def create = Authenticated(parser = parse.urlFormEncoded) { implicit request =>
    levelForm.bindFromRequest.fold(
      formWithErrors => BadRequest(html.admin.creator.levelList(Level.findAll, formWithErrors)), //((taskCreateHTML(taskFromTracingForm, formWithErrors)),
      { t =>
        if (Level.isValidLevelName(t.name)) {
          Level.insertOne(t)
          Ok(html.admin.creator.levelList(Level.findAll, levelForm))
        } else
          BadRequest("Invalid level name")
      })
  }

  def list = Authenticated { implicit request =>
    Ok(html.admin.creator.levelList(Level.findAll, levelForm))
  }
}