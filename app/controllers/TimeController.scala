package controllers

import java.util.Calendar
import javax.inject.Inject

import com.scalableminds.util.tools.Fox
import models.annotation.AnnotationDAO
import models.project.ProjectDAO
import models.task.{Task, TaskService, TaskTypeDAO}
import models.user.time.{TimeSpan, TimeSpanDAO}
import models.user.{User, UserDAO, UserService}
import oxalis.security.{AuthenticatedRequest, Secured}
import play.api.i18n.MessagesApi
import play.api.libs.concurrent.Execution.Implicits._
import play.api.libs.json.{JsObject, JsValue, Json}
import play.api.mvc.AnyContent

import scala.concurrent.Future

class TimeController @Inject()(val messagesApi: MessagesApi) extends Controller with Secured {

  // REST API

  //all users with working hours > 0
  def getWorkingHoursOfAllUsers(year: Int, month: Int) = Authenticated.async { implicit request =>
    for {
      users <- UserDAO.findAll
      js <- loggedTimeForUserList(users, year, month)
    } yield {
      Ok(js)
    }
  }

  //list user with working hours > 0 (only one user is also possible)
  def loggedTimeForMultipleUser(userString: String, year: Int, month: Int) = Authenticated.async { implicit request =>
    var users =  List[User]()

    for {
      usersList <- Fox.sequence(getUsersAsStringForEmail(userString.split(",").toList))
      users = usersList.flatten
      js <- loggedTimeForUserList(users, year, month)
    } yield {
      Ok(js)
    }
      //BadRequest(Json.obj("error" -> "No valid Emails").value)
      //Future{Ok(Json.obj("error" -> "No valid Emails").value)}
  }

  //helper methods

  def loggedTimeForUserList(users: List[User], year: Int, month: Int) (implicit request: AuthenticatedRequest[AnyContent]): Future[JsValue] =  {
    lazy val startDate = Calendar.getInstance()
    lazy val endDate = Calendar.getInstance()
    startDate.set(year, month - 1, startDate.getActualMinimum(Calendar.DAY_OF_MONTH), 0, 0, 0)
    startDate.set(Calendar.MILLISECOND, 0)
    endDate.set(year, month - 1, endDate.getActualMaximum(Calendar.DAY_OF_MONTH), 23, 59, 59)
    endDate.set(Calendar.MILLISECOND, 999)

    val filteredListByPermission = users.filter(user => request.user.isAdminOf(user))
    val futureJsObjects = getUserWithWorkingHours(filteredListByPermission, startDate, endDate)

    for {
      jsObjectList <- Fox.sequence(futureJsObjects)
    } yield {
      Json.toJson(jsObjectList.flatten)
    }
  }

  def getUserWithWorkingHours(users: List[User], startDate: Calendar, endDate: Calendar)(implicit request: AuthenticatedRequest[AnyContent]): List[Fox[JsObject]] = {
    for {
      user <- users
    } yield {
      getUserHours(user, startDate, endDate)
    }
  }

  def getUserHours(user: User, startDate: Calendar, endDate: Calendar)(implicit request: AuthenticatedRequest[AnyContent]): Fox[JsObject] = {
    for {
      timeList <- TimeSpanDAO.findByUser(user, Some(startDate.getTimeInMillis), Some(endDate.getTimeInMillis))
      timeListWithTask <- getOnlyTimeSpansWithTask(timeList)
      boxJs <- Future.traverse(timeListWithTask)(timeWrites(_))
    } yield {
      val js = boxJs.flatten
      if(js.nonEmpty)
        js.head.value.get("time") match {
          case Some(x) =>
            if (isFormatedDurationZero(x.toString())) None
            else Some(Json.obj(
              "user" -> Json.toJson(user)(User.userCompactWrites),
              "timelogs" -> Json.toJson(js)))
          case _ => None
        }
      else
        None
    }
  }

  def getOnlyTimeSpansWithTask(l: List[TimeSpan])(implicit request: AuthenticatedRequest[AnyContent]): Future[List[TimeSpan]] = {
    for {
      list <- Fox.sequence(l.map(t => getTimeSpanOptionTask(t)))
    } yield {
      list.flatten.flatten
    }
  }

  def getTimeSpanOptionTask(t: TimeSpan)(implicit request: AuthenticatedRequest[AnyContent]): Fox[Option[TimeSpan]] = {
    t.annotation match {
      case Some(annotationId) => for {
        annotation <- AnnotationDAO.findOneById(annotationId)
      } yield {
        annotation._task match {
          case Some(_) => Some(t)
          case None => None
        }
      }
      case None => Fox(Future(None))
    }
  }

  def timeWrites(timeSpan: TimeSpan)(implicit request: AuthenticatedRequest[AnyContent]): Fox[JsObject] = {
    for {
      task <- getTaskForTimeSpan(timeSpan)
      tasktype <- TaskTypeDAO.findOneById(task._taskType)
      project <- ProjectDAO.findOneByName(task._project)
    } yield {
      Json.obj(
        "time" -> formatDuration(timeSpan.time),
        "timestamp" -> timeSpan.timestamp,
        "annotation" -> timeSpan.annotation,
        "_id" -> timeSpan._id.stringify,
        "task_id" -> task.id,
        "project_name" -> project.name,
        "tasktype_id" -> tasktype.id,
        "tasktype_summary" -> tasktype.summary)
    }
  }

  def getTaskForTimeSpan(timeSpan: TimeSpan)(implicit request: AuthenticatedRequest[AnyContent]): Fox[Task] = {
    for {
      annotation <- AnnotationDAO.findOneById(timeSpan.annotation.get)
      task <- TaskService.findOneById(annotation._task.get.stringify)
    } yield {
      task
    }
  }

  def totalTimeOfUser(spans: List[TimeSpan]): Long = {
    spans.foldLeft(0l)((_, span) => span.time)
  }

  def getUsersAsStringForEmail(emails: List[String]): List[Fox[User]] = {
    for {
      email <- emails
    } yield {
      UserService.findOneByEmail(email)
    }
  }

  def formatDuration(millis: Long): String = {
  //example: P3Y6M4DT12H30M5S = 3 years + 9 month + 4 days + 12 hours + 30 min + 5 sec
  // only hours, min and sec are important in this scenario
    val h = (millis / 3600000)
    val m = (millis / 60000) % 60
    val s = (millis / 1000) % 60

    var res = "PT"
    if (h>0) res += h+"H"
    if (m>0) res += m+"M"
    res += s+"S"

    res
  }

  def isFormatedDurationZero(d: String): Boolean = {
    val d2 = "PT5M16S"
    val digits = d2.filter(_.isDigit)
    digits.toInt == 0
  }
}
