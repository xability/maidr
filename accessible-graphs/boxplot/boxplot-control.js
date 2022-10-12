
var currentPosition = {'x': -1, 'y': -1};
var rect;

document.addEventListener('DOMContentLoaded', function(e) {
    svg_container.addEventListener("keydown", function (e) {
        // right arrow 39
        if (e.which === 39) {
            currentPosition.x += 1;
        }
        // left arrow 37
        if (e.which === 37) {
            currentPosition.x += -1;
        }
        // up arrow 38
        if (e.which === 38) {
            currentPosition.y += 1;
            currentPosition.x = 0;
        }
        // down arrow 40
        if (e.which === 40) {
            currentPosition.y += -1;
            currentPosition.x = 0;
        }

        // lock to min / max postions
        if ( currentPosition.x < 1 ) {
            currentPosition.x = 0;
        }
        if ( currentPosition.y < 1 ) {
            currentPosition.y = 0;
        }
        if ( currentPosition.y > plotData.length - 1 ) {
            currentPosition.y = plotData.length - 1;
        }
        if ( currentPosition.x > plotData[currentPosition.y].length - 1) {
            currentPosition.x = plotData[currentPosition.y].length - 1;
        }


        UpdateRect();

    });

    if ( debugLevel > 0 ) {
        svg_container.focus();
        currentPosition.x = 2;
        currentPosition.y = 6;
        UpdateRect();
    }

});

function UpdateRect() {

    const rectPadding = 15; // px
    const rectStrokeWidth = 4;
    const rectColorString = 'rgb(3,200,9)';
    const svgBouding = svg.getBoundingClientRect();

    const svgBoundingOffset = 95; // THIS IS A HACK. I don't know why we need this, but find a better bounding box anchor (todo later)
    const svgBoudingOffsetRect = 30.3; // THIS IS A HACK. I don't know why we need this, but find a better bounding box anchor (todo later)

    // get rect bounds
    var x1, x2, y1, y2 = 0;
    if ( plotData[currentPosition.y][currentPosition.x].type == 'outlier' ) {

        x1 = plotData[currentPosition.y][currentPosition.x].x - rectPadding;
        x2 = plotData[currentPosition.y][currentPosition.x].x + rectPadding;
        y1 = plotData[currentPosition.y][currentPosition.x].y - rectPadding;
        y2 = plotData[currentPosition.y][currentPosition.x].y + rectPadding;

    } else if ( plotData[currentPosition.y][currentPosition.x].type == 'whisker' ) {

        var whichWhisker = 'before'; // before / after the range. We steal the other point from range and need to know which one
        if ( currentPosition.x > 0 ) {
            if ( plotData[currentPosition.y][currentPosition.x - 1].type == 'range' ) {
                whichWhisker = 'after';
            }
        }
        if ( whichWhisker == 'before' ) {
            // we're on the before one, use this and next
            x1 = plotData[currentPosition.y][currentPosition.x].x - rectPadding;
            x2 = plotData[currentPosition.y][currentPosition.x + 1].x + rectPadding;
        } else {
            // we're on the after one, use this and prev
            x1 = plotData[currentPosition.y][currentPosition.x - 1].x - rectPadding;
            x2 = plotData[currentPosition.y][currentPosition.x].x + rectPadding;
        }
        y1 = plotData[currentPosition.y][currentPosition.x].y - rectPadding;
        y2 = plotData[currentPosition.y][currentPosition.x].y + rectPadding;

    } else if ( plotData[currentPosition.y][currentPosition.x].type == 'range' ) {

        // we have 3 points, and do the middle one as just that midpoint line
        // which one are we on though? look up and down
        var whichRange = 'middle' ; 
        if ( currentPosition.x > 0 ) {
            if ( plotData[currentPosition.y][currentPosition.x - 1].type != 'range' ) {
                whichRange = 'first';
            }
        } else {
            whichRange = 'first';
        }
        if ( currentPosition.x < plotData[currentPosition.y].length - 2 ) {
            if ( plotData[currentPosition.y][currentPosition.x + 1].type != 'range' ) {
                whichRange = 'last';
            }
        } else {
            whichRange = 'last';
        }

        if ( whichRange == 'first' ) {
            x1 = plotData[currentPosition.y][currentPosition.x].x - rectPadding;
            x2 = plotData[currentPosition.y][currentPosition.x + 1].x + rectPadding;
        } else if ( whichRange == 'middle' ) {
            x1 = plotData[currentPosition.y][currentPosition.x].x - rectPadding;
            x2 = plotData[currentPosition.y][currentPosition.x].x + rectPadding;
        } else if ( whichRange == 'last' ) {
            x1 = plotData[currentPosition.y][currentPosition.x - 1].x - rectPadding;
            x2 = plotData[currentPosition.y][currentPosition.x].x + rectPadding;
        }

        // we have no yMax, but whiskers and outliers have a midpoint, so we use that
        var midpoint = 0;
        for ( var i = 0 ; i < plotData[currentPosition.y].length ; i++ ) {
            if ( plotData[currentPosition.y][i].type != "range" ) {
                midpoint = plotData[currentPosition.y][i].y;
            }
        }
        // y1 and midpoint to get y2
        var height = ( midpoint - plotData[currentPosition.y][currentPosition.x].y ) * 2;
        y1 = plotData[currentPosition.y][currentPosition.x].y;
        y2 = y1 + height;
        

        // swap y1 y2 so height is > 0
        var swap = y1;
        y1 = y2;
        y2 = swap;

        y1 += -svgBoudingOffsetRect + rectPadding;
        y2 += -svgBoudingOffsetRect - rectPadding;
        
    }

    if ( debugLevel > 1 ) {
        console.log(
            "Point", plotData[currentPosition.y][currentPosition.x].type, 
            "x:", plotData[currentPosition.y][currentPosition.x].x, 
            "y:", plotData[currentPosition.y][currentPosition.x].y);
        console.log(
            "x1:", x1, 
            "y1:", y1, 
            "x2:", x2, 
            "y2:", y2);
    }

    
    // recreate rect

    if ( document.getElementById('highlight_rect') ) document.getElementById('highlight_rect').remove();
    const svgns = "http://www.w3.org/2000/svg";
    var rect = document.createElementNS(svgns, 'rect');
    rect.setAttribute('id', 'highlight_rect');
    rect.setAttribute('x', x1);
    rect.setAttribute('y', svgBouding.bottom - svgBoundingOffset - y1); // y coord is inverse from plot data
    rect.setAttribute('width', x2 - x1);
    rect.setAttribute('height', Math.abs(y2 - y1));
    rect.setAttribute('stroke', rectColorString);
    rect.setAttribute('stroke-width', rectStrokeWidth);
    rect.setAttribute('fill', 'none');
    svg.appendChild(rect);

}

