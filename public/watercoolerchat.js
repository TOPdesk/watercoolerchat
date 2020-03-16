function getStarted() {
    let companyName = document.getElementById('company-name').value;
    location.href = "https://watercoolerchat.online/" + encodeURIComponent(companyName) + "/";
}