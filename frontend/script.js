const API_BASE = '';
const uploadArea = document.getElementById('uploadArea');
const fileInput = document.getElementById('fileInput');
const progressSection = document.getElementById('progressSection');
const progressFill = document.getElementById('progressFill');
const progressText = document.getElementById('progressText');
const resultsSection = document.getElementById('resultsSection');
const resultsGrid = document.getElementById('resultsGrid');
const summaryStats = document.getElementById('summaryStats');
const detailModal = document.getElementById('detailModal');
const modalTitle = document.getElementById('modalTitle');
const modalBody = document.getElementById('modalBody');
const closeModal = document.getElementById('closeModal');
let currentResults = [];
let isBulkMode = false;
document.addEventListener('DOMContentLoaded', function() {
uploadArea.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', handleFileSelect);
document.getElementById('singleScanBtn').addEventListener('click', () => {
isBulkMode = false;
fileInput.multiple = false;
fileInput.click();
});
document.getElementById('bulkScanBtn').addEventListener('click', () => {
isBulkMode = true;
fileInput.multiple = true;
fileInput.click();
});
document.getElementById('exportBtn').addEventListener('click', exportResults);
document.getElementById('clearBtn').addEventListener('click', clearResults);
closeModal.addEventListener('click', () => detailModal.style.display = 'none');
window.addEventListener('click', (e) => {
if (e.target === detailModal) detailModal.style.display = 'none';
});
setupDragAndDrop();
});
function setupDragAndDrop() {
['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
uploadArea.addEventListener(eventName, preventDefaults, false);
});
function preventDefaults(e) {
e.preventDefault();
e.stopPropagation();
}
['dragenter', 'dragover'].forEach(eventName => {
uploadArea.addEventListener(eventName, () => uploadArea.classList.add('dragover'), false);
});
['dragleave', 'drop'].forEach(eventName => {
uploadArea.addEventListener(eventName, () => uploadArea.classList.remove('dragover'), false);
});
uploadArea.addEventListener('drop', handleDrop, false);
}
function handleDrop(e) {
const dt = e.dataTransfer;
const files = dt.files;
if (files.length > 1) {
isBulkMode = true;
}
processFiles(files);
}
function handleFileSelect(e) {
const files = e.target.files;
processFiles(files);
}
async function processFiles(files) {
if (files.length === 0) return;
showProgress();
clearResults();
if (isBulkMode || files.length > 1) {
await processBulkScan(files);
} else {
await processSingleScan(files[0]);
}
hideProgress();
}
async function processSingleScan(file) {
try {
const formData = new FormData();
formData.append('file', file);
updateProgress(0, 'Uploading image...');
const response = await fetch(`${API_BASE}/api/upload`, {
method: 'POST',
body: formData
});
updateProgress(50, 'Analyzing content...');
if (!response.ok) throw new Error('Upload failed');
const result = await response.json();
updateProgress(100, 'Analysis complete!');
currentResults = [result];
displayResults();
} catch (error) {
showError('Single scan failed: ' + error.message);
hideProgress();
}
}
async function processBulkScan(files) {
try {
const formData = new FormData();
Array.from(files).forEach(file => {
if (isValidImageFile(file)) {
formData.append('files', file);
}
});
updateProgress(0, `Uploading ${files.length} images...`);
const response = await fetch(`${API_BASE}/api/bulk-scan`, {
method: 'POST',
body: formData
});
updateProgress(50, 'Analyzing content...');
if (!response.ok) throw new Error('Bulk scan failed');
const data = await response.json();
updateProgress(100, 'Analysis complete!');
currentResults = data.results || [];
displayResults(data.summary);
} catch (error) {
showError('Bulk scan failed: ' + error.message);
hideProgress();
}
}
function isValidImageFile(file) {
const validTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/bmp', 'image/webp'];
return validTypes.includes(file.type);
}
function showProgress() {
progressSection.style.display = 'block';
resultsSection.style.display = 'none';
}
function hideProgress() {
setTimeout(() => {
progressSection.style.display = 'none';
}, 500);
}
function updateProgress(percent, message) {
progressFill.style.width = percent + '%';
progressText.textContent = message;
}
function displayResults(summary = null) {
if (currentResults.length === 0) {
showError('No results to display');
return;
}
resultsSection.style.display = 'block';
if (summary) {
displaySummaryStats(summary);
} else {
const singleResult = currentResults[0];
displaySummaryStats({
total: 1,
high_risk: singleResult.status === 'high_risk' ? 1 : 0,
concerning: singleResult.status === 'concerning' ? 1 : 0
});
}
displayResultCards();
}
function displaySummaryStats(summary) {
const safeCount = summary.total - summary.high_risk - summary.concerning;
summaryStats.innerHTML = `
<div class="stat-card safe">
<div class="stat-number">${safeCount}</div>
<div class="stat-label">Safe Images</div>
</div>
<div class="stat-card concerning">
<div class="stat-number">${summary.concerning || 0}</div>
<div class="stat-label">Concerning</div>
</div>
<div class="stat-card high-risk">
<div class="stat-number">${summary.high_risk || 0}</div>
<div class="stat-label">High Risk</div>
</div>
<div class="stat-card">
<div class="stat-number">${summary.total}</div>
<div class="stat-label">Total Scanned</div>
</div>
`;
}
function displayResultCards() {
resultsGrid.innerHTML = currentResults.map(result => `
<div class="result-card ${result.status}" onclick="showResultDetails('${result.filename}')">
<div class="result-filename">${result.original_filename || result.filename}</div>
<div class="result-score ${result.status}">${result.risk_score}/100</div>
<div class="result-status ${result.status}">${result.status.replace('_', ' ')}</div>
<div class="risk-factors">
${result.risk_factors.length > 0 ? result.risk_factors.slice(0, 2).join('<br>') : 'No specific risks detected'}
${result.risk_factors.length > 2 ? '<br>Click for more details...' : ''}
</div>
</div>
`).join('');
}
function showResultDetails(filename) {
const result = currentResults.find(r => r.filename === filename);
if (!result) return;
modalTitle.textContent = `Analysis Details - ${result.original_filename || result.filename}`;
modalBody.innerHTML = `
<div style="margin-bottom: 20px;">
<h4>Risk Assessment</h4>
<div style="display: flex; align-items: center; gap: 15px; margin: 10px 0;">
<div class="result-score ${result.status}" style="margin: 0;">${result.risk_score}/100</div>
<div class="result-status ${result.status}" style="margin: 0;">${result.status.replace('_', ' ')}</div>
</div>
</div>
<div style="margin-bottom: 20px;">
<h4>Risk Factors Detected</h4>
<ul style="margin: 10px 0; padding-left: 20px;">
${result.risk_factors.length > 0 
? result.risk_factors.map(factor => `<li style="margin: 5px 0;">${factor}</li>`).join('') 
: '<li>No specific risk factors detected</li>'}
</ul>
</div>
<div style="margin-bottom: 20px;">
<h4>Recommendations</h4>
<p style="line-height: 1.6;">
${getRecommendations(result.status, result.risk_score)}
</p>
</div>
<div>
<h4>Scan Information</h4>
<p><strong>Scanned:</strong> ${new Date(result.timestamp).toLocaleString()}</p>
<p><strong>Filename:</strong> ${result.filename}</p>
</div>
`;
detailModal.style.display = 'block';
}
function getRecommendations(status, score) {
if (status === 'high_risk') {
return 'This image has been flagged as high risk. Consider reporting to appropriate authorities if it involves minors or illegal content. Remove from accessible locations immediately.';
} else if (status === 'concerning') {
return 'This image shows concerning content that may not be appropriate for children. Review the content and consider parental controls or restricted access.';
} else {
return 'This image appears to be safe based on automated analysis. Continue to monitor and use parental judgment for age-appropriate content.';
}
}
function exportResults() {
if (currentResults.length === 0) {
showError('No results to export');
return;
}
const exportData = {
scan_date: new Date().toISOString(),
total_images: currentResults.length,
summary: {
safe: currentResults.filter(r => r.status === 'safe').length,
concerning: currentResults.filter(r => r.status === 'concerning').length,
high_risk: currentResults.filter(r => r.status === 'high_risk').length
},
results: currentResults.map(r => ({
filename: r.original_filename || r.filename,
risk_score: r.risk_score,
status: r.status,
risk_factors: r.risk_factors,
timestamp: r.timestamp
}))
};
const blob = new Blob([JSON.stringify(exportData, null, 2)], {type: 'application/json'});
const url = URL.createObjectURL(blob);
const a = document.createElement('a');
a.href = url;
a.download = `content_scan_report_${new Date().toISOString().split('T')[0]}.json`;
document.body.appendChild(a);
a.click();
document.body.removeChild(a);
URL.revokeObjectURL(url);
}
function clearResults() {
currentResults = [];
resultsSection.style.display = 'none';
progressSection.style.display = 'none';
fileInput.value = '';
}
function showError(message) {
const errorDiv = document.createElement('div');
errorDiv.style.cssText = 'position:fixed;top:20px;right:20px;background:#dc3545;color:white;padding:15px 20px;border-radius:8px;z-index:1001;font-weight:500;box-shadow:0 4px 12px rgba(220,53,69,0.3)';
errorDiv.textContent = message;
document.body.appendChild(errorDiv);
setTimeout(() => {
document.body.removeChild(errorDiv);
}, 5000);
}