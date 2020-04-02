function getStarted() { // eslint-disable-line no-unused-vars
	const companyName = document.querySelector('company-name').value;
	location.href = '/at/' + encodeURIComponent(companyName) + '/';
}
