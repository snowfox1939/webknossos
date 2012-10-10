### define
libs/datgui/dat.gui : DatGui
libs/request : request
###

PLANE_XY = 0
PLANE_YZ = 1
PLANE_XZ = 2
VIEW_3D  = 3

class Gui 
  
  constructor : (container, data, model, sceneController, cameraController, flycam) ->

    @model = model
    @sceneController = sceneController
    @cameraController = cameraController
    @flycam = flycam
    initPos = @flycam.getGlobalPos()

    # create GUI
    modelRadius = @model.Route.getActiveNodeRadius()
    @settings = { 
                save : @saveNow
                upload : @uploadNML
                download : => window.open(jsRoutes.controllers.admin.NMLIO.downloadList().url,
                                          "_blank", "width=700,height=400,location=no,menubar=no")

                resume : false
                experiments : null
                selectedExperimentIndex : null
                changeExperiment : => 

                  request(
                    method : "POST"
                    url : "/experiment"
                    contentType : "application/json"
                    data : @settings.experiments[@settings.selectedExperimentIndex]
                  ).always -> window.location.reload()

                position : initPos[0] + ", " + initPos[1] + ", " + initPos[2]
                lockZoom: data.lockZoom
                inverseX: data.mouseInversionX == 1
                inverseY: data.mouseInversionY == 1

                routeClippingDistance: data.routeClippingDistance
                displayCrosshairs: data.displayCrosshair
                interpolation : data.interpolation

                displayPrevXY : data.displayPreviewXY
                displayPrevYZ : data.displayPreviewYZ
                displayPrevXZ : data.displayPreviewXZ
                nodesAsSpheres : data.nodesAsSpheres

                activeTreeID : @model.Route.getActiveTreeId()
                newTree : @createNewTree
                deleteActiveTree : @deleteActiveTree

                activeNodeID : @model.Route.getActiveNodeId()
                newNodeNewTree : data.newNodeNewTree
                deleteActiveNode : @deleteActiveNode
                radius : if modelRadius then modelRadius else 10 * @model.Route.scaleX
              }
    @gui  = new dat.GUI({autoPlace: false, width : 280, hideable : false})
    
    container.append @gui.domElement

    fFile = @gui.addFolder("File")
    (fFile.add @settings, "save")
                          .name("Save now")
    (fFile.add @settings, "upload")
                          .name("Upload NML")
    (fFile.add @settings, "download")
                          .name("Download NML")
    
    fExperiment = @gui.addFolder("Experiment")
    request(
      url : "/experiment"
      responseType : "json"
    ).done (experiments) =>
      
      @settings.experiments = experiments

      options = {}
      for experiment, i in experiments
        options[experiment.name] = i

      (fExperiment.add @settings, "selectedExperimentIndex", options)
                            .name("Datasets")
      (fExperiment.add @settings, "changeExperiment")
                            .name("Apply")

    
    fPosition = @gui.addFolder("Position")
    (fPosition.add @settings, "position")
                          .name("Position")
                          .listen()
                          .onFinishChange(@setPosFromString)
    fControls = @gui.addFolder("Controls")
    (fControls.add @settings, "lockZoom")
                          .name("Lock Zoom")
                          .onChange(@setLockZoom)
    (fControls.add @settings, "inverseX")
                          .name("Inverse X")
                          .onChange(@setMouseInversionX)
    (fControls.add @settings, "inverseY")
                          .name("Inverse Y")
                          .onChange(@setMouseInversionY)

    fView = @gui.addFolder("Planes")
    (fView.add @settings, "routeClippingDistance", 1, 100)
                          .name("Clipping Distance")    
                          .onChange(@setRouteClippingDistance)
    (fView.add @settings, "displayCrosshairs")
                          .name("Show Crosshairs")
                          .onChange(@setDisplayCrosshair)
    (fView.add @settings, "interpolation")
                          .name("Interpolation")
                          .onChange(@setInterpolation)

    fSkeleton = @gui.addFolder("Skeleton View")
    (fSkeleton.add @settings, "displayPrevXY")
                          .name("Display XY-Plane")
                          .onChange(@setDisplayPreviewXY)
    (fSkeleton.add @settings, "displayPrevYZ")
                          .name("Display YZ-Plane")
                          .onChange(@setDisplayPreviewYZ)
    (fSkeleton.add @settings, "displayPrevXZ")
                          .name("Display XZ-Plane")
                          .onChange(@setDisplayPreviewXZ)
    (fSkeleton.add @settings, "nodesAsSpheres")
                          .name("Nodes as Spheres")
                          .onChange(@setNodeAsSpheres)

    fTrees = @gui.addFolder("Trees")
    @activeTreeIdController =
    (fTrees.add @settings, "activeTreeID")
                          .min(1)
                          .step(1)
                          .name("Active Tree ID")
                          .onFinishChange(@setActiveTree)
    (fTrees.add @settings, "newNodeNewTree")
                          .name("Soma clicking mode")
                          .onFinishChange(@setNewNodeNewTree)
    (fTrees.add @settings, "newTree")
                          .name("Create New Tree")
    (fTrees.add @settings, "deleteActiveTree")
                          .name("Delete Active Tree")

    fNodes = @gui.addFolder("Nodes")
    @activeNodeIdController =
    (fNodes.add @settings, "activeNodeID")
                          .min(1)
                          .step(1)
                          .name("Active Node ID")
                          .onFinishChange(@setActiveNode)
    scale = @model.Route.scaleX
    (fNodes.add @settings, "radius", 1 * scale , 1000 * scale)
                          .name("Radius")    
                          .listen()
                          .onChange(@setNodeRadius)
    (fNodes.add @settings, "deleteActiveNode")
                          .name("Delete Active Node")

    fFile.open()
    fPosition.open()
    #fControls.open()
    #fView.open()
    #fSkeleton.open()
    fTrees.open()
    fNodes.open()

  saveNow : =>
    @model.Route.pushImpl()
      .fail( -> alert("Something went wrong with saving, please try again."))
      .done( -> alert("Successfully saved!"))

  setPosFromString : (posString) =>
    stringArray = posString.split(",")
    pos = [parseInt(stringArray[0]), parseInt(stringArray[1]), parseInt(stringArray[2])]
    @flycam.setGlobalPos(pos)

  uploadNML : =>
    # Create dummy input field
    input = $("<input>", type : "file")
    input.trigger("click")
    input.on("change", (evt) ->
      file = evt.target.files[0]
      requestObject = jsRoutes.controllers.admin.NMLIO.upload()
      xhr = new XMLHttpRequest()
      # Reload when done
      xhr.onload = -> window.location.reload()
      xhr.open(requestObject.method, requestObject.url, true)
      # send it as form data
      formData = new FormData()
      formData.append("nmlFile", file)
      xhr.send(formData)
    )

  updateGlobalPosition : =>
    pos = @flycam.getGlobalPos()
    @settings.position = Math.round(pos[0]) + ", " + Math.round(pos[1]) + ", " + Math.round(pos[2])

  setRouteClippingDistance : (value) =>
    @model.User.Configuration.routeClippingDistance = (Number) value
    @cameraController.setRouteClippingDistance((Number) value)
    @sceneController.setRouteClippingDistance((Number) value)
    @model.User.Configuration.push()   

  setLockZoom : (value) =>
    @model.User.Configuration.lockZoom = value
    @model.User.Configuration.push()      

  setDisplayCrosshair : (value) =>
    @model.User.Configuration.displayCrosshair = value
    @sceneController.setDisplayCrosshair(value)
    @model.User.Configuration.push()    

  setInterpolation : (value) =>
    @sceneController.setInterpolation(value)
    @model.User.Configuration.interpolation = (Boolean) value
    @model.User.Configuration.push()

  setDisplayPreviewXY : (value) =>
    @model.User.Configuration.displayPreviewXY = value
    @sceneController.setDisplaySV PLANE_XY, value
    @model.User.Configuration.push()      

  setDisplayPreviewYZ : (value) =>
    @model.User.Configuration.displayPreviewYZ = value
    @sceneController.setDisplaySV PLANE_YZ, value
    @model.User.Configuration.push()      

  setDisplayPreviewXZ : (value) =>
    @model.User.Configuration.displayPreviewXZ = value
    @sceneController.setDisplaySV PLANE_XZ, value
    @model.User.Configuration.push()      

  setNodeAsSpheres : (value) =>
    @model.User.Configuration.nodesAsSpheres = value
    @sceneController.skeleton.setDisplaySpheres(value)
    @model.User.Configuration.push()  
    @flycam.hasChanged = true    

  setMouseInversionX : (value) =>
    if value is true
      @model.User.Configuration.mouseInversionX = 1
    else
      @model.User.Configuration.mouseInversionX = -1
    @model.User.Configuration.push()         

  setMouseInversionY : (value) =>
    if value is true
      @model.User.Configuration.mouseInversionY = 1
    else
      @model.User.Configuration.mouseInversionY = -1
    @model.User.Configuration.push()  

  # called when value is changed in input field
  setActiveTree : (value) =>
    @model.Route.setActiveTree(value)
    @updateNodeAndTreeIds()
    @sceneController.updateRoute()

  # called when value user switch to different active tree
  #setActiveTreeId : (value) =>
  #  @settings.activeTreeID = value
  #  @activeTreeIdController.updateDisplay()

  createNewTree : =>
    id = @model.Route.createNewTree()
    @updateNodeAndTreeIds()
    @sceneController.skeleton.createNewTree(id)

  deleteActiveTree : =>
    @model.Route.deleteActiveTree()
    @updateNodeAndTreeIds()
    @sceneController.updateRoute()
    
  # called when value is changed in input field
  setActiveNode : (value) =>
    @flycam.setGlobalPos(@model.Route.setActiveNode(value))
    @updateNodeAndTreeIds()
    @sceneController.skeleton.setActiveNode()

  setNewNodeNewTree : (value) =>
    @model.User.Configuration.newNodeNewTree = value
    @model.User.Configuration.push()      

  setNodeRadius : (value) =>
    @model.Route.setActiveNodeRadius(value)
    # convert from nm to voxels, divide by resolution
    @sceneController.skeleton.setNodeRadius(value)
    @flycam.hasChanged = true

  updateRadius : ->
    @settings.radius = @model.Route.getActiveNodeRadius()

  deleteActiveNode : =>
    @model.Route.deleteActiveNode()
    @updateNodeAndTreeIds()
    @sceneController.updateRoute()

  # called when value user switch to different active node
  updateNodeAndTreeIds : =>
    @settings.activeNodeID = @model.Route.lastActiveNodeId
    @settings.activeTreeID = @model.Route.getActiveTreeId()
    @activeNodeIdController.updateDisplay()
    @activeTreeIdController.updateDisplay()

  # Helper method to combine common update methods
  update : ->
    @updateNodeAndTreeIds()
    @updateRadius()
