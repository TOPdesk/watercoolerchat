new Vue({
	el: "#app",
	data() {
        const url = window.location.href.replace(/\/$/, '');
        const name = url.substr(url.lastIndexOf('/') + 1);
        
        return {
            companyName: name,
            userName: "Anonymous",
            matchId: "",
            state: "not-in-queue" // "queued", "chat-ready"
        }
    }
});