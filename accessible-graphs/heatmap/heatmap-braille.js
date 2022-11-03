// get div that displays braille
const barContainer = document.getElementById("container");
const brailleDiv = document.getElementById("braille-div");
const brailleDisplay = document.getElementById("braille-display");

var low = ymin + range;
var medium = low + range;
var high = medium + range;

// Cursor variables
// var currCursor_row = -1; 
// var currCursor_col = -1;

// var allowedKeys = {
//     "37" : "arrow-left",
//     "39" : "arrow-right"
// }

var brailleArray = [];
for (var i = 0; i < unique_y_coord.length; i++) {
    for (var j = 0; j < unique_x_coord.length; j++) {
        if (norms[i][j] == 0) {
            brailleArray.push("⠀");
        } else if (norms[i][j] <= low) {
            brailleArray.push("⠤");
        } else if (norms[i][j] <= medium) {
            brailleArray.push("⠒");
        } else if (norms[i][j] <= high) {
            brailleArray.push("⠉");
        }
    }
    brailleArray.push("⠳");
}

var display = false;
var brailleText = brailleArray.join("")
brailleDisplay.innerHTML = brailleText;
brailleDiv.style.display = "none";

// For input
// brailleDisplay.value = brailleText;
// brailleDisplay.setSelectionRange(0,0);

barContainer.addEventListener("keydown", function (e) {
    if (e.which == 66) {
        if (display) {
            brailleDiv.style.display = "none";
            // brailleDiv.focus();
        } else {
            brailleDiv.style.display = "block";
            brailleDiv.focus();
        }
        display = !display;
    }

    // Cursor function
    // if (!allowedKeys[e.which]) {
    //     e.preventDefault();
    // }

    // if (currCursor < 0 && e.which == 39) {
    //     e.preventDefault();
    //     currCursor++;
    // } else if (currCursor >=  - 1 && e.which == 39) {
    //     e.preventDefault();
    // } else if (e.which == 39) {
    //     brailleDisplay.setSelectionRange(currCursor, currCursor);
    //     currCursor++;
    // }

    // if (currCursor > _numBars - 1 && e.which == 37) {
    //     e.preventDefault();
    //     currCursor--;
    // } else if (currCursor <= 0 && e.which == 37) {
    //     e.preventDefault();
    // } else if (e.which == 37) {
    //     brailleDisplay.setSelectionRange(currCursor, currCursor);
    //     currCursor--;
    // }
});
