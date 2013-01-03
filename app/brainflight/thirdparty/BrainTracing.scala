package brainflight.thirdparty

import brainflight.security.SCrypt._
import models.user.User
import play.api.libs.ws.WS
import com.ning.http.client.Realm.AuthScheme
import play.api.libs.concurrent.Execution.Implicits._
import play.api.Logger
import play.api.Play.current
import play.api.Play
import scala.concurrent.Promise
import scala.concurrent.Future
import scala.util._
import play.api.libs.concurrent.Akka

object BrainTracing {
  val URL = "http://braintracing.org/oxalis_create_user.php"
  val USER = "brain"
  val PW = "trace"
  val LICENSE = "hu39rxpv7m"

  val isActive = Play.configuration.getBoolean("braintracing.active") getOrElse false
  
  def register(user: User, password: String): Future[String] = {
    val pwHash = md5(password)
    if (isActive) {
      val result = Promise[String]()
      WS
        .url(URL)
        .withAuth(USER, PW, AuthScheme.BASIC)
        .withQueryString(
          "license" -> LICENSE,
          "firstname" -> user.firstName,
          "lastname" -> user.lastName,
          "email" -> user.email,
          "pword" -> pwHash)
        .get()
        .map { response =>
          result complete (response.status match {
            case 200 =>
              Success("braintracing.new")
            case 304 =>
              Success("braintracing.exists")
            case _ =>
              Success("braintraceing.error")
          })
          Logger.info("Creation of account %s returned Status: %s Body: %s".format(user.email, response.status, response.body))
        }
      result.future
    } else {
      Future.successful("braintracing.new")
    }
  }
}