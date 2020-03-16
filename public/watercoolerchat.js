function getStarted() {
    let companyName = document.getElementById('company-name').value;
    location.href = "/company/" + encodeURIComponent(companyName) + "/";
}

new Vue({
	el: "#app",
	data() {
        var url = window.location.href.replace(/\/$/, '');
        var name = url.substr(url.lastIndexOf('/') + 1);
        console.log(name);
        return {
            companyName: name,
            state: "not-in-queue" // "queued", "chat-ready"
        }
    }
});