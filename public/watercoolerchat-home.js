function getStarted() {
    let companyName = document.getElementById('company-name').value;
    location.href = "/at/" + encodeURIComponent(companyName) + "/";
}
