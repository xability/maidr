
// **********************************************************************
// ******************* MAIN FUNCTIONS ***********************************
// **********************************************************************
// 
// This is the main boxplotscript. 
// It handles all customization for this chart, controls everything,
// and calls every thing needed from here.
//


document.addEventListener('DOMContentLoaded', function(e) { // we wrap in DOMContentLoaded to make sure everything has loaded before we run anything

    // variable initialization
    window.constants = new Constants(); // global var lelelelel
    let position = new Position(-1, -1);
    let plot = new BoxPlot(constants.plotId);
    let rect = new BoxplotRect(plot);
    let audio = new Audio(plot, position);

    // control eventlisteners
    constants.svg_container.addEventListener("keydown", function (e) {
        // right arrow 39
        if (e.which === 39) {
            position.x += 1;
        }
        // left arrow 37
        if (e.which === 37) {
            position.x += -1;
        }
        // up arrow 38
        if (e.which === 38) {
            position.y += 1;
            position.x = 0;
        }
        // down arrow 40
        if (e.which === 40) {
            position.y += -1;
            position.x = 0;
        }

        // lock to min / max postions
        if ( position.x < 1 ) {
            position.x = 0;
        }
        if ( position.y < 1 ) {
            position.y = 0;
        }
        if ( position.y > plot.plotData.length - 1 ) {
            position.y = plot.plotData.length - 1;
        }
        if ( position.x > plot.plotData[position.y].length - 1) {
            position.x = plot.plotData[position.y].length - 1;
        }

        if ( constants.showRect ) {
            rect.UpdateRect(position);
        }
        if ( constants.audioPlay > 0 ) {
            audio.playTone();
        }

    });

});

// BoxPlot class.
// This initializes and contains the JSON data model for this chart
class BoxPlot {

    constructor(plotId) {
        this.plotData = this.GetBoxData(plotId); // main json data
    }

    GetBoxData(id) {
        // data in svg is formed as nested <g> elements. Loop through and get all point data
        // goal is to get bounding x values and type (outlier, whisker, range)

        if ( constants.debugLevel > 0 ) {
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

                    let segmentType = this.GetBoxplotSegmentType(sections[j].getAttribute('id'));
                    let segmentPoints = this.GetBoxplotSegmentPoints(segment, segmentType)

                    for ( let l = 0 ; l < segmentPoints.length  ; l += 2 ) {
                        let thisPoint = {'x': Number(segmentPoints[l]), 'y': Number(segmentPoints[l+1]), 'type': segmentType}
                        if ( thisPoint.x > constants.maxX ) constants.maxX = thisPoint.x;
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

        if ( constants.debugLevel > 0 ) {
            console.log('plotData:', plotData);
        }
        return plotData;
    }

    GetBoxplotSegmentType(sectionId) {
        // Helper function for main GetBoxData:
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
        // Helper function for main GetBoxData:
        // Fetch x and y point data from svg

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
            let matches = segment.getAttribute('points').match(re);
            if ( matches[0] != matches[2] )
            {
                points.push(matches[0], matches[1], matches[2], matches[3]);
            }
        }

        return points;
    }
}

// BoxplotRect class
// Initializes and updates the visual outline around sections of the chart
class BoxplotRect {

    // maybe put this stuff in user config?
    rectPadding = 15; // px
    rectStrokeWidth = 4; // px
    rectColorString = 'rgb(3,200,9)';

    svgBoundingOffset = 95; // THIS IS A HACK. I don't know why we need this, but find a better bounding box anchor (todo later)
    svgBoudingOffsetRect = 30.3; // THIS IS A HACK. I don't know why we need this, but find a better bounding box anchor (todo later)

    constructor(plot) {
        this.x1 = 0;
        this.x2 = 0;
        this.y1 = 0;
        this.y2 = 0;
        this.plot = plot;
    }

    UpdateRect(position) {
        // UpdateRect does some horrible calculations to get bounds of visual outline to be drawn

        // get rect bounds
        if ( this.plot.plotData[position.y][position.x].type == 'outlier' ) {

            this.x1 = this.plot.plotData[position.y][position.x].x - this.rectPadding;
            this.x2 = this.plot.plotData[position.y][position.x].x + this.rectPadding;
            this.y1 = this.plot.plotData[position.y][position.x].y - this.rectPadding;
            this.y2 = this.plot.plotData[position.y][position.x].y + this.rectPadding;

        } else if ( this.plot.plotData[position.y][position.x].type == 'whisker' ) {

            var whichWhisker = 'before'; // before / after the range. We steal the other point from range and need to know which one
            if ( position.x > 0 ) {
                if ( this.plot.plotData[position.y][position.x - 1].type == 'range' ) {
                    whichWhisker = 'after';
                }
            }
            if ( whichWhisker == 'before' ) {
                // we're on the before one, use this and next
                this.x1 = this.plot.plotData[position.y][position.x].x - this.rectPadding;
                this.x2 = this.plot.plotData[position.y][position.x + 1].x + this.rectPadding;
            } else {
                // we're on the after one, use this and prev
                this.x1 = this.plot.plotData[position.y][position.x - 1].x - this.rectPadding;
                this.x2 = this.plot.plotData[position.y][position.x].x + this.rectPadding;
            }
            this.y1 = this.plot.plotData[position.y][position.x].y - this.rectPadding;
            this.y2 = this.plot.plotData[position.y][position.x].y + this.rectPadding;

        } else if ( this.plot.plotData[position.y][position.x].type == 'range' ) {

            // we have 3 points, and do the middle one as just that midpoint line
            // which one are we on though? look up and down
            var whichRange = 'middle' ; 
            if ( position.x > 0 ) {
                if ( this.plot.plotData[position.y][position.x - 1].type != 'range' ) {
                    whichRange = 'first';
                }
            } else {
                whichRange = 'first';
            }
            if ( position.x < this.plot.plotData[position.y].length - 2 ) {
                if ( this.plot.plotData[position.y][position.x + 1].type != 'range' ) {
                    whichRange = 'last';
                }
            } else {
                whichRange = 'last';
            }

            if ( whichRange == 'first' ) {
                this.x1 = this.plot.plotData[position.y][position.x].x - this.rectPadding;
                this.x2 = this.plot.plotData[position.y][position.x + 1].x + this.rectPadding;
            } else if ( whichRange == 'middle' ) {
                this.x1 = this.plot.plotData[position.y][position.x].x - this.rectPadding;
                this.x2 = this.plot.plotData[position.y][position.x].x + this.rectPadding;
            } else if ( whichRange == 'last' ) {
                this.x1 = this.plot.plotData[position.y][position.x - 1].x - this.rectPadding;
                this.x2 = this.plot.plotData[position.y][position.x].x + this.rectPadding;
            }

            // we have no yMax, but whiskers and outliers have a midpoint, so we use that
            var midpoint = 0;
            for ( var i = 0 ; i < this.plot.plotData[position.y].length ; i++ ) {
                if ( this.plot.plotData[position.y][i].type != "range" ) {
                    midpoint = this.plot.plotData[position.y][i].y;
                }
            }
            // y1 and midpoint to get y2
            var height = ( midpoint - this.plot.plotData[position.y][position.x].y ) * 2;
            this.y1 = this.plot.plotData[position.y][position.x].y;
            this.y2 = this.y1 + height;


            // swap y1 y2 so height is > 0
            var swap = this.y1;
            this.y1 = this.y2;
            this.y2 = swap;

            this.y1 += -this.svgBoudingOffsetRect + this.rectPadding;
            this.y2 += -this.svgBoudingOffsetRect - this.rectPadding;

        }

        if ( constants.debugLevel > 3 ) {
            console.log(
                "Point", this.plot.plotData[position.y][position.x].type, 
                "x:", this.plot.plotData[position.y][position.x].x, 
                "y:", this.plot.plotData[position.y][position.x].y);
            console.log(
                "x1:", this.x1, 
                "y1:", this.y1, 
                "x2:", this.x2, 
                "y2:", this.y2);
        }

        this.UpdateRectDisplay();
    }

    UpdateRectDisplay() {
        // UpdateRectDisplay takes bounding points and creates the visual outline 

        if ( document.getElementById('highlight_rect') ) document.getElementById('highlight_rect').remove(); // destroy and recreate
        const svgns = "http://www.w3.org/2000/svg";
        var rect = document.createElementNS(svgns, 'rect');
        rect.setAttribute('id', 'highlight_rect');
        rect.setAttribute('x', this.x1);
        rect.setAttribute('y', constants.svg.getBoundingClientRect().bottom - this.svgBoundingOffset - this.y1); // y coord is inverse from plot data
        rect.setAttribute('width', this.x2 - this.x1);
        rect.setAttribute('height', Math.abs(this.y2 - this.y1));
        rect.setAttribute('stroke', this.rectColorString);
        rect.setAttribute('stroke-width', this.rectStrokeWidth);
        rect.setAttribute('fill', 'none');
        constants.svg.appendChild(rect);
    }
}

