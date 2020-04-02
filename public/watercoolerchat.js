const states = {
    notInQueue: "not-in-queue",
    queued: "queued",
    chatReady: "chat-ready"
}

new Vue({
	el: "#app",
	data() {
        const url = window.location.href.replace(/\/$/, '');
        const name = url.substr(url.lastIndexOf('/') + 1);
        
        return {
            companyName: name,
            userName: "",
            queueId: "",
            chatPartner: "",
            state: states.notInQueue
        }
    },
    methods: {
        async enterQueue() {
            this.state = states.queued;
            this.chatPartner = "";
            this.queueId = (await this.addtoQueue(this.userName, this.companyName)).queueId;
            window.setTimeout(() => this.searchChatPartner(this.queueId), 3000);
        },
        async addtoQueue(userName, companyName) {
            return await this.doPut("/api/queue", {
                userName: userName,
                companyName: companyName
            });
        },
        async doPut(url, data) {
            const response = await fetch(url, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(data)
            });
            return await response.json();
        },
        async searchChatPartner(queueId) {
            const response = await fetch(`/api/match/${queueId}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                }
            });
            const result = await response.json();
            if (result.matchResult == "found") {
                this.chatUrl = result.chatUrl;
                this.chatPartner = result.chatPartner;
                this.state = states.chatReady;
            }
            else {
                window.setTimeout(() => this.searchChatPartner(queueId), 5000);
            }
        }
    }
});