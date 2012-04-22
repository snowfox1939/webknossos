package controllers

import java.nio.ByteBuffer
import akka.actor._
import akka.dispatch._
import akka.util.duration._
import akka.pattern.{ ask, pipe }
import akka.util.Timeout
import play.api._
import play.api.mvc._
import play.api.data._
import play.api.libs.json.Json._
import play.api.Play.current
import play.api.libs.iteratee._
import Input.EOF
import play.api.libs.concurrent._
import play.api.libs.concurrent._
import play.api.libs.json.JsValue
import play.libs.Akka._
import models.Actors._
import models.Role
import brainflight.binary._
import brainflight.security.Secured
import brainflight.tools.geometry.{ Point3D, Cube }
import models.DataSet

/**
 * scalableminds - brainflight
 * User: tmbo
 * Date: 11.12.11
 * Time: 13:21
 */

object BinaryData extends Controller with Secured {
  override val DefaultAccessRole = Role( "user" )

  def calculateBinaryData( dataSet: DataSet, cube: Cube, resolutionExponent: Int ): Future[Array[Byte]] = {
    implicit val timeout = Timeout( 5 seconds ) // needed for `?` below
    val coordinates = cube.calculateInnerPoints()
    val resolution = math.pow( 2, resolutionExponent ).toInt

    // rotate the model and generate the requested data
    val future = DataSetActor ? BlockRequest( dataSet, resolution, coordinates )
    future.mapTo[Array[Byte]]
  }
  
  def calculateCube( position: Point3D, cubeSize: Int) = {
    val cubeCorner = position.scale( x => x - x % cubeSize )
    Cube( cubeCorner, cubeSize )
  }

  /**
   * Handles a request for binary data via a HTTP POST. The content of the
   * POST body is specified in the BinaryProtokoll.parseAjax functions.
   */
  def requestViaAjax( dataSetId: String, cubeSize: Int ) = Authenticated( parser = parse.raw ) { user =>
    implicit request =>
      Async {
        ( for {
          payload <- request.body.asBytes()
          message <- BinaryProtocoll.parseAjax( payload )
          dataSet <- DataSet.findOneById( dataSetId )
        } yield {
          message match {
            case RequestData( resolutionExponent, position ) =>
              val cube = calculateCube( position, cubeSize )
              calculateBinaryData( dataSet, cube, resolutionExponent ).asPromise.map(
                result => Ok( result ) )
            case _ =>
              Akka.future {
                BadRequest( "Unknown message." )
              }
          }
        } ) getOrElse ( Akka.future { BadRequest( "Request body is to short: %d bytes".format( request.body.size ) ) } )
      }
  }  
  /**
   * Handles a request for binary data via websockets. The content of a websocket
   * message is defined in the BinaryProtokoll.parseWebsocket function.
   * If the message is valid the result is posted onto the websocket.
   *
   * @param
   * 	modelType:	id of the model to use
   */
  def requestViaWebsocket( dataSetId: String, cubeSize: Int ) = AuthenticatedWebSocket[Array[Byte]]() { user =>
    request =>
      val dataSetOpt = DataSet.findOneById( dataSetId )
      val output = Enumerator.imperative[Array[Byte]]()
      val input = Iteratee.foreach[Array[Byte]]( in => {
        // first 4 bytes are always used as a client handle
        BinaryProtocoll.parseWebsocket( in ).map {
          case message @ RequestData( resolutionExponent, position ) =>
            val cube = calculateCube( position, cubeSize )
            for {
              dataSet <- dataSetOpt
              result <- calculateBinaryData( dataSet, cube, resolutionExponent )
            } {
              output.push( message.handle ++ result )
            }
        }
      } )
      ( input, output )
  }

  def model( modelType: String ) = Action {
    ModelStore( modelType ) match {
      case Some( model ) =>
        Ok( toJson( model.vertices.map( _.toVector3I ) ) )
      case _ =>
        NotFound( "Model not available." )
    }
  }
  def polygons( modelType: String ) = Action {
    ModelStore( modelType ) match {
      case Some( model ) =>
        Ok( toJson( model.polygons ) )
      case _ =>
        NotFound( "Model not available." )
    }
  }
}