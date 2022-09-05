var form = document.getElementById("form");
var submitBtn = document.getElementById("submitBtn");
var invalid_text = document.getElementById("notValid");

var yVal; 

form.addEventListener("submit", function(e) {
    e.preventDefault();
    let input = document.getElementById("yVal").value;
    yVal = input.split(",").map(function(item) {
        return parseFloat(item.trim());
    });
    sessionStorage.setItem("yVal", yVal);
    if (yVal.length != _numBars) {
        invalid_text.innerHTML = "Invalid input";
    } else {
        window.location.assign("/Users/y.yujun/Documents/Data accessiblization/accessible-graphs (local)/barplot.html");
    }
})