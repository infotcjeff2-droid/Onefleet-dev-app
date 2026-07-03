var apiPane = null;//Open API objects
var pageItems = [];//menu collection

$(document).ready(function () {
    langInitByUrl();
    apiPane = new apiPage();
    loadReadyPage();
});

function loadReadyPage() {
    if (typeof lang == "undefined") {
        setTimeout(loadReadyPage, 50);
    } else {
        // Solve the impact of PC screen scaling ratio on page layout
        handleScreen();
        //Get server platform information
        ajaxLoadInformation();
    }
}

function initPage() {
    initApiPageItems();
    loadPage();
}

//Load Language
function loadLang() {
    $('#spanHome').text(lang.open_home);
    $('#spanWeb').text(lang.open_webApi);
    $('#spanPhone').text(lang.open_phoneApi);
    $('#spanWindows').text(lang.open_windowsApi);
    $('#H1Title').text(lang.open_webApiFile);
    $('#spanApiDesc').text(lang.open_webApiDesc);
    document.title = lang.open_webApiFile;
}

//Load page
function loadPage() {
    if (!pageItems) {
        setTimeout(loadPage, 50);
    } else {
        loadMainPane();
    }
}

//Load main page
function loadMainPane() {
    var leftContent = '<div class="span3 bs-docs-sidebar">';
    leftContent += '<div class="bs-docs-sidenav">';
    var rightContent = '<div class="span9">';
    for (var i = 0; i < pageItems.length; i++) {
        var pageItem = pageItems[i];
        var title = apiPane.getItemTitle(pageItem.id);
        if (pageItem.id == 1) {//Interface Description
            leftContent += '<ul class="nav nav-list">';
            leftContent += '	<li><a href="#sec-' + pageItem.name + '" class="nav-header menu-first" title="' + title + '">' + title + '</a></li>';
            leftContent += '</ul>';
        } else {
            leftContent += '<a href="#sec-' + pageItem.name + '" class="nav-header menu-first" data-toggle="collapse" title="' + title + '">' + title + '</a>';
        }
        rightContent += apiPane.initRightMainPane(pageItem.name, title);
        if (pageItem.privis && pageItem.privis.length > 0) {
            leftContent += '<ul class="nav nav-list collapse" id="sec-' + pageItem.name + '">';
            var privis = pageItem.privis;
            for (var j = 0; j < privis.length; j++) {
                var page = privis[j];
                var title_ = apiPane.getItemTitle(page.id);
                leftContent += '<li><a href="#sec-' + page.name + '" title="' + title_ + '"><i class="icon-chevron-right"></i>' + title_ + '</a></li>';
                rightContent += apiPane.initRightPane(page.id, page.name, title_);
            }
            leftContent += '</ul>';
        }
    }
//leftContent += ' <li class="dropdown"><a href="#" title="Up">Up</a></li>';
    leftContent += '</div>';
    leftContent += '</div>';
    rightContent += "</div>";
    $("#mainPane").append(leftContent + rightContent);

    //Load bootstrap js
    addBootstrapJs();

    //Expand currently and collapse all others
    $(".nav-header.menu-first").on('click', function () {
        var newIndex = $(this).index();
        if (newIndex && oldIndex != newIndex) {
            //Closed and opened columns and other frames
            $(".nav.nav-list.in.collapse").each(function () {
                $(this).removeAttr("style");
                $(this).attr("class", "nav nav-list collapse");
            });
            oldIndex = newIndex;
        }
    });
}

var oldIndex = 0;

//Load bootstrap js
function addBootstrapJs() {
    loadScript(getRootPath()+'/bootstrap/js/bootstrap-v2.3.2.min.js', function () {
        //Add sliding click event to menu
        $('[data-spy="scroll"]').each(function () {
            $(this).scrollspy();
        });
        loadScript(getRootPath()+'/bootstrap/js/holder.min.js', null);
        loadScript(getRootPath()+'/bootstrap/js/application.js', null);
        /*$('a[href^="#"]').click(function(){
            var the_id = $(this).attr("href");
            if(the_id && the_id != '#' && $(the_id).get(0)) {
                $('html, body').animate({
                    scrollTop: $(the_id).offset().top
                }, 'slow');
                return false;
            }
        });*/
    });
}

//Initialize page menu array
function initApiPageItems() {
    //Interface Description
    pageItems.push(initPriviInfo(1, "api-desc"));
    //User login logout
    var userop = initPriviInfo(2, "user-operate");
    userop.privis = [];
    userop.privis.push(initPriviInfo(21, "user-login"));//Log in
    userop.privis.push(initPriviInfo(22, "user-logout"));//quit
//userop.privis.push(initPriviInfo(23, "user-bind"));
//userop.privis.push(initPriviInfo(24, "user-unbind"));
    pageItems.push(userop);
    //Vehicle information query
    var vehicleop = initPriviInfo(3, "vehicle-operate");
    vehicleop.privis = [];
    vehicleop.privis.push(initPriviInfo(36, "vehicle-device-info"));//Obtain user authorized vehicle and equipment information
    vehicleop.privis.push(initPriviInfo(31, "vehicle-device-idno"));//Get device number
    vehicleop.privis.push(initPriviInfo(32, "vehicle-device-online"));//device status
    vehicleop.privis.push(initPriviInfo(33, "vehicle-device-gps"));//device gps status
    vehicleop.privis.push(initPriviInfo(34, "vehicle-device-track"));//Get device track (pagination)
    vehicleop.privis.push(initPriviInfo(35, "vehicle-device-alarm"));//Get alarm data (suspended)
    vehicleop.privis.push(initPriviInfo(37, "vehicle-device-alarmPosition")); //Get real-time alerts
    vehicleop.privis.push(initPriviInfo(38, "vehicle-device-mileage")); //vehicle mileage
    vehicleop.privis.push(initPriviInfo(39, "vehicle-device-park")); //Vehicle driving and parking alarm
    vehicleop.privis.push(initPriviInfo(40, "vehicle-device-position")); //Vehicle location list

    if (!police) {
        vehicleop.privis.push(initPriviInfo(30, "vehicle-mileage-detail")); //Mileage detailed report
    }
    vehicleop.privis.push(initPriviInfo(1135, "vehicle-access-area")); //Entry and exit area details
    pageItems.push(vehicleop);
    //Video related business
    var videoop = initPriviInfo(4, "video-operate");
    videoop.privis = [];

    //Initialize video plug-in (H5 and Flash)
    // videoop.privis.push(initPriviInfo(416, "video-init-all"))
    //Initialize video plug-in (H5, does not support IE)
    videoop.privis.push(initPriviInfo(417, "video-init-h5"))

    // videoop.privis.push(initPriviInfo(41, "video-init"));//Initialize video plug-in (Flash)
    videoop.privis.push(initPriviInfo(42, "video-live-html"));//Real-time video (Flash web integrated version)
    videoop.privis.push(initPriviInfo(43, "video-live-js"));//Real-time video (javascript Flash)
    videoop.privis.push(initPriviInfo(410, "video-live-address"));//Real-time video (live broadcast address HLS)
    videoop.privis.push(initPriviInfo(411, "video-live-web-integration"));//Real-time video (web page integrated HLS)
    videoop.privis.push(initPriviInfo(44, "video-monitor"));//Monitor Flash
    videoop.privis.push(initPriviInfo(45, "video-talkback"));//Intercom Flash
    videoop.privis.push(initPriviInfo(412, "video-live-web-rtsp"));//Real time video RTSP
    videoop.privis.push(initPriviInfo(413, "video-live-web-rtmp"));//Real-time video RTMP(FLV)
    videoop.privis.push(initPriviInfo(418, "video-web-rtmp"));//Live video RTMP
    //videoop.privis.push(initPriviInfo(801, "video-init-h5"));
    //videoop.privis.push(initPriviInfo(802, "video-live-web-integration-flv"));
    pageItems.push(videoop);


    if (police) {
        var pttoop = initPriviInfo(501000, "audio-ptts");
        pttoop.privis = [];
        pttoop.privis.push(initPriviInfo(501001, "audio-ptt"));//Cluster intercom
        pageItems.push(pttoop);
    }

    //Document related business
    var reqRecoop = initPriviInfo(10, "reqRec-operate");
    reqRecoop.privis = [];
    reqRecoop.privis.push(initPriviInfo(405, "video-realTime"));//real time video
    reqRecoop.privis.push(initPriviInfo(46, "video-search"));//Video query
    reqRecoop.privis.push(initPriviInfo(419, "video-search-history"));//Video query history
    reqRecoop.privis.push(initPriviInfo(47, "video-download"));//Video download
    reqRecoop.privis.push(initPriviInfo(48, "video-playback"));//Remote playback
    reqRecoop.privis.push(initPriviInfo(481, "video-playback-h5"));//Remote playback HTML5
    reqRecoop.privis.push(initPriviInfo(49, "video-img-capture"));//Picture capture
    reqRecoop.privis.push(initPriviInfo(50, "video-img-get")); //Image acquisition
    reqRecoop.privis.push(initPriviInfo(400, "video-down-get")); //Get segmented download tasks
    reqRecoop.privis.push(initPriviInfo(401, "video-down-delete")); //Delete the device to be downloaded segmented tasks
    reqRecoop.privis.push(initPriviInfo(406, "insert-media-records")); //Insert video\audio\picture record
    //reqRecoop.privis.push(initPriviInfo(407, "del-media-records"));
    reqRecoop.privis.push(initPriviInfo(408, "video-ftpUpload")); //ftp upload
    reqRecoop.privis.push(initPriviInfo(409, "video-ftpStatus")); //ftp task status query
    reqRecoop.privis.push(initPriviInfo(414, "query-ftpList")); //ftp task list query
    reqRecoop.privis.push(initPriviInfo(415, "query-ftpControl")); //FTP video download control command
    pageItems.push(reqRecoop);

    //Active safety business
    if (!police){
        var safeTy = initPriviInfo(11, "safety-operate");
        safeTy.privis = [];
        safeTy.privis.push(initPriviInfo(1101, "query-safetyAlarm")); //Security alarm query
        safeTy.privis.push(initPriviInfo(1102, "query-safetyEvidence")); //Security evidence query
        safeTy.privis.push(initPriviInfo(102, "query-alarmEvidence")); //Alarm attachment query
        pageItems.push(safeTy);
    }


    //Video Department Standard 1078 Business
    var media1078 = initPriviInfo(12, "1078-operate");
    media1078.privis = [];
    media1078.privis.push(initPriviInfo(402, "video-rate-of-flow")); //User media traffic query
    media1078.privis.push(initPriviInfo(403, "catalog-summary")); //Query resource summary
    media1078.privis.push(initPriviInfo(404, "catalog-detail")); //Query resource details
    media1078.privis.push(initPriviInfo(100, "query-photo")); //Image query
    media1078.privis.push(initPriviInfo(101, "query-audioOrVideo")); //Audio and video query
    pageItems.push(media1078);

    //Rules related business
    var ruleoop = initPriviInfo(6, "rule-operate");
    ruleoop.privis = [];
    ruleoop.privis.push(initPriviInfo(60, "rule-add"));//Create new linkage alarm
    ruleoop.privis.push(initPriviInfo(61, "rule-query"));//Query linkage alarm
    ruleoop.privis.push(initPriviInfo(62, "rule-edit"));//Modify linkage alarm
    ruleoop.privis.push(initPriviInfo(63, "rule-delete"));//Delete linked alarm
    ruleoop.privis.push(initPriviInfo(64, "rule-authorize")); //Device allocation rules
    ruleoop.privis.push(initPriviInfo(65, "rule-dev-relation")); //Query the device corresponding to the rule Query the association relationship of the rule device
    ruleoop.privis.push(initPriviInfo(66, "rule-dev-relation-delete")); //Delete the association relationship assigned by the rule
    ruleoop.privis.push(initPriviInfo(67, "rule-queryList")); //Query the rules that users can query based on the rule type
    pageItems.push(ruleoop);

    //vehicle control business
    var vehicontrol = initPriviInfo(5, "vehicle-control-operate");
    vehicontrol.privis = [];
//vehicontrol.privis.push(initPriviInfo(51, "vehicle-control-server"));
    vehicontrol.privis.push(initPriviInfo(52, "vehicle-control-op"));//vehicle control
    vehicontrol.privis.push(initPriviInfo(53, "vehicle-control-tts"));//tts
    vehicontrol.privis.push(initPriviInfo(54, "vehicle-control-ptz"));//PTZ control
    //vehicontrol.privis.push(initPriviInfo(56, "vehicle-control-data-downlink-transparent"));//downlink transparent
    pageItems.push(vehicontrol);

    //Device management
    var devimanagement = initPriviInfo(8, "device-management");
    devimanagement.privis = [];
    devimanagement.privis.push(initPriviInfo(55, "vehicle-control-device"));//Get device information
    devimanagement.privis.push(initPriviInfo(81, "device-management-addDevice"));//Add new device
    devimanagement.privis.push(initPriviInfo(86, "device-management-editDevice"));//Add new device
    devimanagement.privis.push(initPriviInfo(82, "device-management-addVehicle"));//Add new vehicle
    if (police) {
        devimanagement.privis.push(initPriviInfo(88, "device-management-updVehicle"));
    }
    devimanagement.privis.push(initPriviInfo(83, "device-management-delDevice"));//Remove device
    devimanagement.privis.push(initPriviInfo(84, "device-management-delVehicle"));//Remove device
    if (!police) {
        devimanagement.privis.push(initPriviInfo(85, "device-management-installVehicle"));//install equipment
        devimanagement.privis.push(initPriviInfo(87, "device-management-uninstallDevice"));//Uninstall device
    }
    pageItems.push(devimanagement);

    //Device management
    if (!police){
        var flowmanagement = initPriviInfo(700, "flow-management");
        flowmanagement.privis = [];
        flowmanagement.privis.push(initPriviInfo(70, "flow-management-getFlowInfo"));//Get traffic
        flowmanagement.privis.push(initPriviInfo(71, "flow-management-saveFlowConfig"));//Configure traffic parameters
        pageItems.push(flowmanagement);
    }

    //Area information
    var areamanagement = initPriviInfo(9, "area-management");
    areamanagement.privis = [];
    areamanagement.privis.push(initPriviInfo(91, "area-management-areaInfo"));//User area information
    areamanagement.privis.push(initPriviInfo(92, "area-management-add-areaInfo"));//Add regional information
    areamanagement.privis.push(initPriviInfo(93, "area-management-edit-areaInfo"));//Modify area information
    areamanagement.privis.push(initPriviInfo(94, "area-management-find-areaInfo"));//View area information
    areamanagement.privis.push(initPriviInfo(95, "area-management-delete-areaInfo"));//Delete zone information

    pageItems.push(areamanagement);

    if (police) {//Police system-specific interface
        //Area information
        var policemanagement = initPriviInfo(99, "police-management");
        policemanagement.privis = [];
        policemanagement.privis.push(initPriviInfo(991, "police-management-addGroup"));//Add new coordination group
        policemanagement.privis.push(initPriviInfo(992, "police-management-delGroup"));//Delete coordination group
        policemanagement.privis.push(initPriviInfo(993, "police-management-addMemberGroup"));//Add police officers to collaborative team
        policemanagement.privis.push(initPriviInfo(994, "police-management-delMemberGroup"));//Delete police officers from the coordination group
        policemanagement.privis.push(initPriviInfo(995, "police-management-callGroup"));//Call record query
        pageItems.push(policemanagement);

        var controlmanagement = initPriviInfo(400000, "control-management");
        controlmanagement.privis = [];
        controlmanagement.privis.push(initPriviInfo(400001, "control-management-getInfo"));//Get a list of faces
        controlmanagement.privis.push(initPriviInfo(400002, "control-management-getDetail"));//Get the details of the control personnel
        pageItems.push(controlmanagement);
    }

    //organize information
    var companymanagement = initPriviInfo(100000, "company-management");
    companymanagement.privis = [];
    companymanagement.privis.push(initPriviInfo(100001, "company-management-add"));//User's new modification operation
    companymanagement.privis.push(initPriviInfo(100002, "company-management-find"));//User's new modification operation
    companymanagement.privis.push(initPriviInfo(100003, "company-management-delete"));//User's new modification operation
    pageItems.push(companymanagement);

    //Role
    var rolemanagement = initPriviInfo(200000, "role-management");
    rolemanagement.privis = [];
    rolemanagement.privis.push(initPriviInfo(200001, "role-management-add"));//User's new modification operation
    rolemanagement.privis.push(initPriviInfo(200002, "role-management-find"));//User's new modification operation
    rolemanagement.privis.push(initPriviInfo(200003, "role-management-delete"));//User's new modification operation
    pageItems.push(rolemanagement);

    //User Info
    var accountmanagement = initPriviInfo(300000, "account-management");
    accountmanagement.privis = [];
    accountmanagement.privis.push(initPriviInfo(300001, "account-management-add"));//User's new modification operation
    accountmanagement.privis.push(initPriviInfo(300002, "account-management-find"));//User's new modification operation
    accountmanagement.privis.push(initPriviInfo(300003, "account-management-delete"));//User's new modification operation
    accountmanagement.privis.push(initPriviInfo(300004, "authorization-get"));
    accountmanagement.privis.push(initPriviInfo(300005, "authorization-add"));
    accountmanagement.privis.push(initPriviInfo(300006, "authorization-del"));
    pageItems.push(accountmanagement);

    if (!police){
        //Driver management
        var driverManagement = initPriviInfo(500000, "driver-management");
        driverManagement.privis = [];
        driverManagement.privis.push(initPriviInfo(500001, "findDriverInfoByDeviceId"));//Check whether the vehicle driver has changed based on the device number
        driverManagement.privis.push(initPriviInfo(500002, "findVehicleInfoByDeviceId"));//Query the driver of the vehicle based on the device number
        driverManagement.privis.push(initPriviInfo(500010, "findVehicleInfoByDeviceJn"));//Query driver information based on qualification certificate code/driver’s license number
        driverManagement.privis.push(initPriviInfo(500003, "queryDriverPunchDetail"));//Check the driver’s check-in record details
        driverManagement.privis.push(initPriviInfo(500004, "queryIdentifyAlarm"));//Query identification alarm
        driverManagement.privis.push(initPriviInfo(500005, "qureyDriverList"));//Query driver list
        driverManagement.privis.push(initPriviInfo(500006, "driver-info-add"));//Add new driver
        driverManagement.privis.push(initPriviInfo(500007, "driver-info-delete"));//Find a driver
        driverManagement.privis.push(initPriviInfo(500008, "driver-info-find"));//Delete driver
        driverManagement.privis.push(initPriviInfo(500009, "driver-info-upload-image"));//upload image
        pageItems.push(driverManagement);

        //SIM card management
        var simManagement = initPriviInfo(600000, "sim-management");
        simManagement.privis = [];
        simManagement.privis.push(initPriviInfo(600001, "addSimCard"));//Added and modified sim information
        simManagement.privis.push(initPriviInfo(600002, "findSimCard"));//View sim information
        simManagement.privis.push(initPriviInfo(600003, "deleteSimCard"));//Delete sim information
        simManagement.privis.push(initPriviInfo(600004, "loadSimCard"));//Load sim information
        simManagement.privis.push(initPriviInfo(600005, "unbindSimCard"));//Unbind sim
        pageItems.push(simManagement);

        //Statistical reports
        var reportManagement = initPriviInfo(700000, "statistical_reports");
        reportManagement.privis = [];
        reportManagement.privis.push(initPriviInfo(700001, "report_people_summary"));//Passenger flow statistics summary
        reportManagement.privis.push(initPriviInfo(700002, "report_people_detail"));//Passenger flow statistics details
        //reportManagement.privis.push(initPriviInfo(700003, "report_people_summary_1078"));//Passenger flow statistics summary
        //reportManagement.privis.push(initPriviInfo(700004, "report_people_detail_1078"));//Passenger flow statistics details
        pageItems.push(reportManagement);


        //Electronic fence (the server interface is hidden first, this version is not tested)
 /*       var electronicFenceManagement = initPriviInfo(800000, "electronic_fence_management");
        electronicFenceManagement.privis = [];
        electronicFenceManagement.privis.push(initPriviInfo(800001, "electronic_fence_management_circle"));//Set circular area
        electronicFenceManagement.privis.push(initPriviInfo(800002, "electronic_fence_management_rect"));//Set rectangular area
        electronicFenceManagement.privis.push(initPriviInfo(800003, "electronic_fence_management_poligon"));//Set polygon area
        electronicFenceManagement.privis.push(initPriviInfo(800004, "electronic_fence_management_line"));//Set route area
        electronicFenceManagement.privis.push(initPriviInfo(800005, "electronic_fence_management_delete"));//delete area
        pageItems.push(electronicFenceManagement);*/

    }

}

//Get array
function initPriviInfo(id, name) {
    return {id: id, name: name};
}

//Get server platform information
var police = false;

function ajaxLoadInformation() {
    //Send ajax request to server
    $.ajax({
        url: 'StandardLoginAction_information.action',
        type: "post",
        data: null,
cache: false,/*Disable browser cache*/
        dataType: "json",
        success: function (json,textStatus, xhr) {
            json = getdecryptRes(json,xhr)
            if (json.result == 0) {
                document.title = lang.open_webApiFile;
                if (json.police && json.police == 1) {
                    repairPoliceByZh(lang);
                    police = true;
                    apiPane.police = true;
                }
                if (langIsChinese()) {
                    if (json.ChineseMainTitle != null) {
                        document.title += '-' + json.ChineseMainTitle;
                        $('#spanTitle').text(json.ChineseMainTitle);
                    }
                    if (json.ChineseCopyright != null) {
                        $("#spanCopyright").html(json.ChineseCopyright);
                    }
                } /*else if (langIsTW()){
					if (json.TwMainTitle != null)  {
						document.title += '-'+ json.TwMainTitle;
						$('#spanTitle').text(json.TwMainTitle);
					}
					if (json.TwCopyright != null) {
						$("#spanCopyright").html(json.TwCopyright);
					}
				}*/ else {
                    if (json.EnglishMainTitle != null) {
                        document.title += '-' + json.EnglishMainTitle;
                        $('#spanTitle').text(json.EnglishMainTitle);
                    }
                    if (json.EnglishCopyright != null) {
                        $("#spanCopyright").html(json.EnglishCopyright);
                    }
                }
            } else {
                alert(lang.errException);
            }
            //Load Language
            loadLang();
            initPage();
        }, error: function (XMLHttpRequest, textStatus, errorThrown) {
            if (textStatus != "error") {
                //alert(parent.lang.errSendRequired + " errorThrown:" + errorThrown + ",textStatus:" + textStatus);
            }
            alert(lang.errException);
            initPage();
        }
    });
}
