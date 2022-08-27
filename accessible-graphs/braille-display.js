// get div that displays braille
const brailleDiv = document.getElementById("braille-div");
const brailleDisplay = document.getElementById("braille-display");

const ymin = Math.min(...y_values);
const ymax = Math.max(...y_values);
const range = (ymax - ymin) / 4;
var range1 = ymin + range;
var range2 = range1 + range;
var range3 = range2 + range;
var range4 = range3 + range;
console.log(range1, range2, range3, range4);

var brailleArray = [];
for (var i = 0; i < y_values.length; i++) {
    if (y_values[i] <= range1) {
        brailleArray.push("⣀");
    } else if (y_values[i] <= range2) {
        brailleArray.push("⠤");
    } else if (y_values[i] <= range3) {
        brailleArray.push("⠒");
    } else if (y_values[i] <= range4) {
        brailleArray.push("⠉");
    }
}
var display = true;
var brailleText = brailleArray.join("")
brailleDisplay.innerHTML = brailleText;

window.addEventListener("keydown", function(e) {
    if (e.which == 66) {
        if (display) {
            brailleDiv.style.display = "none";
        } else {
            brailleDiv.style.display = "block";
        }
        display = !display;
    }
})