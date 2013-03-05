### define
../../libs/request : Request
libs/event_mixin : EventMixin
###

class User

  # userdata
  # default values are defined in server
  moveValue : null
  moveValue3d : null
  rotateValue : null
  crosshairSize : null
  scaleValue : null
  mouseRotateValue : null
  routeClippingDistance : null
  lockZoom : null
  displayCrosshair : null
  interpolation : null
  fourBit : null
  briConNames : null
  brightness : null
  contrast : null
  quality : null
  zoomXY : null
  zoomYZ : null
  zoomXZ : null
  displayPreviewXY : null
  displayPreviewYZ : null
  displayPreviewXZ : null
  newNodeNewTree : null
  nodesAsSpheres : null
  mouseInversionX : null
  mouseInversionY : null
  mouseActive : null
  keyboardActive : null
  gamepadActive : null
  motionsensorActive : null
  firstVisToggle : null
  particleSize : null


  constructor : (user) ->

    _.extend(this, new EventMixin())
    _.extend(@, user)


  setValue : (name, value) ->

    @[name] = value
    @trigger(name + "Changed", value)


  push : ->

    $.when(@pushImpl())


  pushImpl : ->
    deferred = $.Deferred()
      
    Request.send(
      url      : "/user/configuration"
      type     : "POST"
      dataType : "json"
      data   : { 
        moveValue : @moveValue,
        moveValue3d : @moveValue3d,
        rotateValue : @rotateValue,
        crosshairSize : @crosshairSize,
        scaleValue : @scaleValue,
        mouseRotateValue : @mouseRotateValue,
        routeClippingDistance : @routeClippingDistance,
        lockZoom : @lockZoom,
        displayCrosshair : @displayCrosshair,
        interpolation : @interpolation,
        fourBit: @fourBit,
        briConNames : @briConNames,
        brightness: @brightness,
        contrast: @contrast, 
        quality : @quality,
        zoomXY : @zoomXY,
        zoomYZ : @zoomYZ,
        zoomXZ : @zoomXZ,
        displayPreviewXY : @displayPreviewXY,
        displayPreviewYZ : @displayPreviewYZ,
        displayPreviewXZ : @displayPreviewXZ,
        newNodeNewTree : @newNodeNewTree,
        nodesAsSpheres : @nodesAsSpheres,
        mouseInversionX : @mouseInversionX,
        mouseInversionY : @mouseInversionY,
        mouseActive : @mouseActive,
        keyboardActive : @keyboardActive,
        gamepadActive : @gamepadActive,
        motionsensorActive : @motionsensorActive
        firstVisToggle : @firstVisToggle 
        particleSize : @particleSize }
    ).fail( =>
      
      console.log "could'nt save userdata"

    ).always(-> deferred.resolve())
    
    deferred.promise()    
