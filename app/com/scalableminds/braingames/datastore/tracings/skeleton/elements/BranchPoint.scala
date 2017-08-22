/*
 * Copyright (C) 2011-2017 scalable minds UG (haftungsbeschränkt) & Co. KG. <http://scm.io>
 */
package com.scalableminds.braingames.datastore.tracings.skeleton.elements

import javax.xml.stream.XMLStreamWriter

import com.scalableminds.util.xml.SynchronousXMLWrites
import play.api.libs.json.Json


case class BranchPoint(
  id: Int,
  timestamp: Long)

object BranchPoint {
  implicit val jsonFormat = Json.format[BranchPoint]

  implicit object BranchPointXMLWrites extends SynchronousXMLWrites[BranchPoint] {
    def synchronousWrites(b: BranchPoint)(implicit writer: XMLStreamWriter): Boolean = {
      writer.writeStartElement("branchpoint")
      writer.writeAttribute("id", b.id.toString)
      writer.writeAttribute("time", b.timestamp.toString)
      writer.writeEndElement()
      true
    }
  }
}
