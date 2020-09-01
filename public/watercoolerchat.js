import {getCompanyNameFromUrl, redirectToHttps} from './utils.js';

redirectToHttps();

const states = Object.freeze({
	notInQueue: 'not-in-queue',
	queued: 'queued',
	chatReady: 'chat-ready'
});

const companyName = getCompanyNameFromUrl();

new Vue({ // eslint-disable-line no-new, no-undef
	el: '#app',
	data() {
		return {
			features: [],
			companyName,
			userName: '',
			queueId: '',
			chatPartners: '',
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
			this.chatPartners = '';
			this.queueId = (await this.addtoQueue(this.userName, this.companyName)).queueId;
			this.searchChatPartners(this.queueId);
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
		async searchChatPartners(queueId) {
			const response = await fetch(`/api/match/${queueId}`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				}
			});
			const result = await response.json();
			if (result.matchResult === 'groupFull') {
				this.chatUrl = result.chatUrl;
				this.chatPartners = result.chatPartners;
				this.state = states.chatReady;
			} else {
				window.setTimeout(() => this.searchChatPartners(queueId), 5000);
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
