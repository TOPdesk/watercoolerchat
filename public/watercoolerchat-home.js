function getStarted() { // eslint-disable-line no-unused-vars
	const companyName = document.querySelector('#company-name').value;
	location.href = '/at/' + encodeURIComponent(companyName) + '/';
}

if (!window.location.href.startsWith('https') && !window.location.href.startsWith('http://localhost')) {
	window.location.href = window.location.href.replace('http', 'https');
}
