const states = Object.freeze({
	notInQueue: 'not-in-queue',
	queued: 'queued',
	chatReady: 'chat-ready'
});

if (!window.location.href.startsWith('https') && !window.location.href.startsWith('http://localhost')) {
	window.location.href = window.location.href.replace('http', 'https');
}

new Vue({ // eslint-disable-line no-new, no-undef
	el: '#app',
	data() {
		const url = window.location.href.replace(/\/$/, '');
		const companyName = url.slice(url.lastIndexOf('/') + 1);

		return {
			features: [],
			companyName,
			userName: '',
			queueId: '',
			chatPartner: '',
			state: states.notInQueue
		};
	},
	mounted() {
		if (localStorage.name) {
			this.userName = localStorage.name;
		}
	},
	watch: {
		userName(newName) {
			localStorage.name = newName;
		}
	},
	methods: {
		async enterQueue() {
			this.state = states.queued;
			this.chatPartner = '';
			this.queueId = (await this.addtoQueue(this.userName, this.companyName)).queueId;
			window.setTimeout(() => this.searchChatPartner(this.queueId), 3000);
		},
		async addtoQueue(userName, companyName) {
			const subscriptionId = localStorage.getItem('subscriptionId');
			return this.doPut('/api/queue', {userName, companyName, subscriptionId});
		},
		async doPut(url, data) {
			const response = await fetch(url, {
				method: 'PUT',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify(data)
			});
			return response.json();
		},
		async searchChatPartner(queueId) {
			const response = await fetch(`/api/match/${queueId}`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				}
			});
			const result = await response.json();
			if (result.matchResult === 'found') {
				this.chatUrl = result.chatUrl;
				this.chatPartner = result.chatPartner;
				this.state = states.chatReady;
			} else {
				window.setTimeout(() => this.searchChatPartner(queueId), 5000);
			}
		},
		async retrieveFeatures() {
			const response = await fetch('/api/features/enabled', {
				headers: {
					'Content-Type': 'application/json'
				}
			});
			const result = await response.json();
			this.features = result.features;
		}
	},
	async created() {
		this.retrieveFeatures();
	}
});
