/*
 * Copyright (C) 2011-2017 scalable minds UG (haftungsbeschränkt) & Co. KG. <http://scm.io>
 */
package com.scalableminds.braingames.datastore.tracings.skeleton

import java.io.OutputStream
import javax.xml.stream.{XMLOutputFactory, XMLStreamWriter}

import com.scalableminds.braingames.datastore.tracings.Tracing
import com.scalableminds.util.geometry.Scale
import com.scalableminds.util.tools.Fox
import com.scalableminds.util.xml.Xml
import com.sun.xml.txw2.output.IndentingXMLStreamWriter
import net.liftweb.common.Box
import play.api.libs.concurrent.Execution.Implicits._
import play.api.libs.iteratee.Enumerator

import scala.concurrent.Future

object NmlWriter {
  private lazy val outputService = XMLOutputFactory.newInstance()

  def toNmlStream(tracing: Tracing, scale: Scale) = {
    Enumerator.outputStream {os => toNml(tracing, os, scale).map(_ => os.close())}
  }

  def toNml(tracing: Tracing, outputStream: OutputStream, scale: Scale): Future[Box[Unit]] = {
    implicit val writer = new IndentingXMLStreamWriter(outputService.createXMLStreamWriter(outputStream))

    Xml.withinElement("things") {
      for {
        _ <- Xml.withinElement("parameters")(writeParametersAsXml(tracing, scale, writer))
        _ <- Xml.toXML(tracing.trees.filterNot(_.nodes.isEmpty))
        _ <- Xml.withinElement("branchpoints")(Xml.toXML(tracing.trees.flatMap(_.branchPoints).sortBy(-_.timestamp)))
        _ <- Xml.withinElement("comments")(Xml.toXML(tracing.trees.flatMap(_.comments)))
      } yield ()
    }.futureBox.map { result =>
      writer.writeEndDocument()
      writer.close()
      result
    }
  }

  def writeParametersAsXml(tracing: Tracing, scale: Scale, writer: XMLStreamWriter): Fox[Unit] = {
    writer.writeStartElement("experiment")
    writer.writeAttribute("name", tracing.dataSetName)
    writer.writeEndElement()
    writer.writeStartElement("scale")
    writer.writeAttribute("x", scale.x.toString)
    writer.writeAttribute("y", scale.y.toString)
    writer.writeAttribute("z", scale.z.toString)
    writer.writeEndElement()
    writer.writeStartElement("offset")
    writer.writeAttribute("x", "0")
    writer.writeAttribute("y", "0")
    writer.writeAttribute("z", "0")
    writer.writeEndElement()
    writer.writeStartElement("time")
    writer.writeAttribute("ms", tracing.timestamp.toString)
    writer.writeEndElement()
    writer.writeStartElement("editPosition")
    writer.writeAttribute("x", tracing.editPosition.x.toString)
    writer.writeAttribute("y", tracing.editPosition.y.toString)
    writer.writeAttribute("z", tracing.editPosition.z.toString)
    writer.writeEndElement()
    writer.writeStartElement("editRotation")
    writer.writeAttribute("xRot", tracing.editRotation.x.toString)
    writer.writeAttribute("yRot", tracing.editRotation.y.toString)
    writer.writeAttribute("zRot", tracing.editRotation.z.toString)
    writer.writeEndElement()
    writer.writeStartElement("zoomLevel")
    writer.writeAttribute("zoom", tracing.zoomLevel.toString)
    writer.writeEndElement()
    Fox.successful(())
  }
}
