// variables for manipulation of bars
var currBar = -1;

// manipulate bars using left and right arrows
svg.addEventListener("keydown", function (e) {
  if (e.which === 39) {
    if (currBar == -1) {
      currBar += 1;
      select(currBar);
      displayValues(currBar);
    } else if (currBar > -1 && currBar < _numBars - 1) {
      currBar += 1;
      select(currBar);
      deselect(currBar - 1);
      displayValues(currBar);
    }
  }

  if (e.which === 37) {
    if (currBar > 0 && currBar < _numBars) {
      currBar -= 1;
      select(currBar);
      deselect(currBar + 1);
      displayValues(currBar);
    }
  }
});

function select(num) {
  this.document.getElementById(bars[num]).style.fill = "rgb(3,200,9)";
}

function deselect(num) {
  this.document.getElementById(bars[num]).style.fill = "rgb(89,89,89)";
}

function displayValues(num) {
  this.document.getElementById("x").innerHTML = "x-value: " + x_values[num];
  this.document.getElementById("y").innerHTML = "y-value: " + y_values[num];
}