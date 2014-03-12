/*
 * Copyright (C) 20011-2014 Scalable minds UG (haftungsbeschränkt) & Co. KG. <http://scm.io>
 */
package controllers

import oxalis.security.Secured
import models.user.time.{TimeSpan, TimeSpanService}
import play.api.i18n.Messages
import play.api.libs.json.Json
import braingames.util.Fox
import play.api.libs.concurrent.Execution.Implicits._
import models.user.{User, UserDAO}
import scala.concurrent.duration.Duration

object StatisticsController extends Controller with Secured{
  val intervalHandler = Map(
    "month" -> TimeSpan.groupByMonth _,
    "week" -> TimeSpan.groupByWeek _
  )

  def intervalTracingTimeJson[T<: models.user.time.Interval](times: Map[T, Duration]) = times.map{
    case (interval, duration) => Json.obj(
      "start" -> interval.start.toString(),
      "end" -> interval.end.toString(),
      "tracingTime" -> duration.toMillis
    )
  }

  def oxalis(interval: String, start: Option[Long], end: Option[Long]) = Authenticated.async{ implicit request =>
    intervalHandler.get(interval) match{
      case Some(handler) =>
        TimeSpanService.loggedTimePerInterval(handler, start, end).map{ times =>
          Ok(Json.obj(
            "name" -> "oxalis",
            "tracingTimes" -> intervalTracingTimeJson(times)
          ))
        }
      case _ =>
        Fox.successful(BadRequest(Messages("statistics.interval.invalid")))
    }
  }

  def users(interval: String, start: Option[Long], end: Option[Long]) = Authenticated.async{ implicit request =>
    intervalHandler.get(interval) match{
      case Some(handler) =>
        for{
          users <- UserDAO.findAll
          usersWithTimes <- Fox.combined(users.map( user => TimeSpanService.loggedTimeOfUser(user, handler, start, end).map(user -> _)))
        } yield {
          val json = usersWithTimes.map{
            case (user, times) => Json.obj(
              "user" -> User.userCompactWrites(request.user).writes(user),
              "tracingTimes" -> intervalTracingTimeJson(times)
            )
          }
          Ok(Json.toJson(json))
        }
      case _ =>
        Fox.successful(BadRequest(Messages("statistics.interval.invalid")))
    }
  }
}
