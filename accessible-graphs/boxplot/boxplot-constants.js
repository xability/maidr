// get boxplot svg and rect componenets
const svg_container = document.getElementById("svg-container");
const svg = document.querySelector("#svg-container > svg");
const plotData = GetBoxData('geom_boxplot.gTree.68.1');

var debug = 1;

function GetBoxData(id) {
    // data in svg is formed as nested <g> elements. Loop through and get all point data
    // goal is to get bounding x values and type (outlier, whisker, range)

    if ( debug > 0 ) {
        document.getElementById(id).setAttribute("data-debug", "MAINCONTAINERHERE");
    }

    var plotData = [];

    var plots = document.getElementById(id).children;
    for ( var i = 0 ; i < plots.length ; i++ ) {
        var sections = plots[i].children;
        var points = []
        for ( var j = 0 ; j < sections.length ; j++ ) {
            // get segments for this section, there are 2 each
            // sometimes they're 0, so ignore those TODO 
            var segments = sections[j].children;
            for ( var k = 0 ; k < segments.length ; k++ ) {
                var segment = segments[k];

                var segmentType = GetBoxplotSegmentType(sections[j].getAttribute('id'));
                var segmentPoints = GetBoxplotSegmentPoints(segment, segmentType)

                for ( var l = 0 ; l < segmentPoints.length ; l++ ) {
                    var thisPoint = {'x': segmentPoints[l], 'type': segmentType}
                    points.push(thisPoint);
                }
            }
        }

        // post processing
        // Sort
        points.sort(function(a,b) {
            return a.x - b.x;
        });
        // and remove whisker from range dups
        var noDupPoints = [];
        for ( var i = 0 ; i < points.length ; i++ ) {
            if ( i > 0 ) {
                if ( points[i-1].x == points[i].x ) {
                    if ( points[i-1].type == "whisker" ) {
                        noDupPoints.splice(-1,1);
                        noDupPoints.push(points[i]);
                    } else {
                    }
                } else {
                    noDupPoints.push(points[i]);
                }
            }else {
                noDupPoints.push(points[i]);
            }
        }

        plotData.push(noDupPoints);
    }

    return plotData;
}

function GetBoxplotSegmentType(sectionId) {
    // Fetch type, which comes from section id:
    // geom_polygon = range
    // GRID = whisker
    // points = outlier

    var segmentType = 'outlier'; // default?
    if ( sectionId.includes('geom_crossbar') ) {
        segmentType = 'range';
    } else if ( sectionId.includes('GRID') ) {
        segmentType = 'whisker';
    } else if ( sectionId.includes('points') ) {
        segmentType = 'outlier';
    }

    return segmentType;
}
function GetBoxplotSegmentPoints(segment, segmentType) {
    // Fetch the segments on all these. Sometimes they're len 0, ignore.
    // (Range has comes in wrapper + middle and has to be reparsed to points)

    var points = [];

    var re = /(?:\d+(?:\.\d*)?|\.\d+)/g;
    var pointString = "";
    var points = [];
    if ( segmentType == "range" ) {
        // ranges go a level deeper
        var matches = segment.children[0].getAttribute('points').match(re);
        points.push(matches[0]);
        // the middle bar has 2 points but we just need one, check if they're the same
        if ( matches[0] != matches[2] )
        {
            points.push(matches[2]);
        }
    } else if ( segmentType == "outlier" ) {
        // outliers use x attr directly, but have multiple children
        for ( var i = 0 ; i < segment.children.length ; i++ ) {
            points.push(segment.children[i].getAttribute('x'));
        }
    } else {
        // whisker. Get first and third number from points attr
        // but sometimes it's null, giving the same for both, and don't add if that's true
        matches = segment.getAttribute('points').match(re);
        if ( matches[0] != matches[2] )
        {
            points.push(matches[0], matches[2]);
        }
    }

    return points;
}


// HELPER FUNCTIONS
// TODO put these in helper.js or something

function containsObject(obj, arr) {
    for ( var i = 0 ; i < arr.length ; i++ ) {
        if ( arr[i] === obj ) return true;
    }
    return false;
}

