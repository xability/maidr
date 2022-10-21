
class Constants {

    // basic chart properties
    static minX = 0;
    static maxX = 0;
    static plotId = 'geom_boxplot.gTree.68.1';
    static svg_container = document.getElementById("svg-container");
    static svg = document.querySelector("#svg-container > svg");

    static debugLevel = 1; // 0 = no console output, 1 = some console, 2 = more console, etc
    showRect = 1;  // true / false
}

class BoxPlot extends Chart {

    static plotId = 'geom_boxplot.gTree.68.1';

    // main json data
    plotData = this.GetBoxData(plotId);

    GetBoxData(id) {
        // data in svg is formed as nested <g> elements. Loop through and get all point data
        // goal is to get bounding x values and type (outlier, whisker, range)

        if ( debugLevel > 0 ) {
            document.getElementById(id).setAttribute("data-debug", "MAINCONTAINERHERE");
        }

        let plotData = [];

        let plots = document.getElementById(id).children;
        for ( let i = 0 ; i < plots.length ; i++ ) {
            let sections = plots[i].children;
            let points = []
            for ( let j = 0 ; j < sections.length ; j++ ) {
                // get segments for this section, there are 2 each
                // sometimes they're 0, so ignore those TODO 
                let segments = sections[j].children;
                for ( let k = 0 ; k < segments.length ; k++ ) {
                    let segment = segments[k];

                    let segmentType = GetBoxplotSegmentType(sections[j].getAttribute('id'));
                    let segmentPoints = GetBoxplotSegmentPoints(segment, segmentType)

                    for ( let l = 0 ; l < segmentPoints.length  ; l += 2 ) {
                        let thisPoint = {'x': Number(segmentPoints[l]), 'y': Number(segmentPoints[l+1]), 'type': segmentType}
                        if ( thisPoint.x > maxX ) maxX = thisPoint.x;
                        points.push(thisPoint);
                    }
                }
            }

            // post processing
            // Sort this plot
            points.sort(function(a,b) {
                return a.x - b.x;
            });
            // and remove whisker from range dups
            let noDupPoints = [];
            for ( let d = 0 ; d < points.length ; d++ ) {
                if ( d > 0 ) {
                    if ( points[d-1].x == points[d].x ) {
                        if ( points[d-1].type == "whisker" ) {
                            noDupPoints.splice(-1,1);
                            noDupPoints.push(points[d]);
                        } else {
                        }
                    } else {
                        noDupPoints.push(points[d]);
                    }
                } else {
                    noDupPoints.push(points[d]);
                }
            }

            plotData.push(noDupPoints);
        }

        // put plots in order
        plotData.sort(function(a,b) {
            return a[0].y - b[0].y;
        });

        if ( debugLevel > 0 ) {
            console.log('plotData:', plotData);
        }
        return plotData;
    }

    GetBoxplotSegmentType(sectionId) {
        // Fetch type, which comes from section id:
        // geom_polygon = range
        // GRID = whisker
        // points = outlier

        let segmentType = 'outlier'; // default?
        if ( sectionId.includes('geom_crossbar') ) {
            segmentType = 'range';
        } else if ( sectionId.includes('GRID') ) {
            segmentType = 'whisker';
        } else if ( sectionId.includes('points') ) {
            segmentType = 'outlier';
        }

        return segmentType;
    }
    GetBoxplotSegmentPoints(segment, segmentType) {

        let points = [];

        let re = /(?:\d+(?:\.\d*)?|\.\d+)/g;
        let pointString = "";
        let points = [];
        if ( segmentType == "range" ) {
            // ranges go a level deeper
            let matches = segment.children[0].getAttribute('points').match(re);
            points.push(matches[0], matches[1]);
            // the middle bar has 2 points but we just need one, check if they're the same
            if ( matches[0] != matches[2] )
            {
                points.push(matches[2], matches[3]);
            }
        } else if ( segmentType == "outlier" ) {
            // outliers use x attr directly, but have multiple children
            points.push(segment.getAttribute('x'), segment.getAttribute('y'));
        } else {
            // whisker. Get first and third number from points attr
            // but sometimes it's null, giving the same for both, and don't add if that's true
            matches = segment.getAttribute('points').match(re);
            if ( matches[0] != matches[2] )
            {
                points.push(matches[0], matches[1], matches[2], matches[3]);
            }
        }

        return points;
    }
}


// HELPER FUNCTIONS
// TODO put these in helper.js or something

class Helper {

    containsObject(obj, arr) {
        for ( let i = 0 ; i < arr.length ; i++ ) {
            if ( arr[i] === obj ) return true;
        }
        return false;
    }
}

