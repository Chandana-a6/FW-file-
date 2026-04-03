const API_URL = window.location.origin + '/api';

// State
let products = [];
let selectedProductId = null;

// DOM Elements
const viewWelcome = document.getElementById('view-welcome');
const viewAddProduct = document.getElementById('view-add-product');
const viewProductDetail = document.getElementById('view-product-detail');
const productList = document.getElementById('product-list');
const btnShowAddProduct = document.getElementById('btn-show-add-product');

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    fetchProducts();
    
    // Event Listeners
    btnShowAddProduct.addEventListener('click', showAddProductForm);
    
    document.getElementById('form-add-product').addEventListener('submit', handleAddProduct);
    document.getElementById('form-upload-firmware').addEventListener('submit', handleUploadFirmware);
});

// Routing/View Management
function hideAllViews() {
    viewWelcome.classList.add('hidden');
    viewAddProduct.classList.add('hidden');
    viewProductDetail.classList.add('hidden');
}

function showAddProductForm() {
    hideAllViews();
    viewAddProduct.classList.remove('hidden');
    selectedProductId = null;
    renderProductList(); // Remove active state
}

function showUploadModal() {
    const modal = document.getElementById('upload-modal');
    modal.classList.remove('hidden');
    document.getElementById('form-upload-firmware').reset();
    document.getElementById('upload-msg').innerText = '';
}

function hideUploadModal() {
    const modal = document.getElementById('upload-modal');
    modal.classList.add('hidden');
}

function showToast(message, type = 'success') {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.className = `toast show ${type}`;
    
    setTimeout(() => {
        toast.classList.remove('show');
    }, 3000);
}

// API Calls & Rendering
async function fetchProducts() {
    try {
        const response = await fetch(`${API_URL}/products`);
        products = await response.json();
        renderProductList();
        
        if (selectedProductId) {
            selectProduct(selectedProductId);
        }
    } catch (error) {
        showToast('Failed to fetch products. Backend down?', 'error');
        console.error(error);
    }
}

function renderProductList() {
    productList.innerHTML = '';
    
    products.forEach(p => {
        const li = document.createElement('li');
        li.className = `product-item ${selectedProductId === p.id ? 'active' : ''}`;
        
        const nameSpan = document.createElement('span');
        nameSpan.textContent = p.name;
        
        li.appendChild(nameSpan);
        
        if (p.latest_version) {
            const badge = document.createElement('span');
            badge.className = 'fw-badge';
            badge.textContent = `v${p.latest_version}`;
            li.appendChild(badge);
        }
        
        li.onclick = () => selectProduct(p.id);
        productList.appendChild(li);
    });
}

function selectProduct(id) {
    selectedProductId = id;
    renderProductList();
    
    const product = products.find(p => p.id === id);
    if (!product) return;
    
    hideAllViews();
    viewProductDetail.classList.remove('hidden');
    
    document.getElementById('detail-product-name').textContent = product.name;
    document.getElementById('stat-current-version').textContent = product.latest_version ? `v${product.latest_version}` : 'None';
    
    const uploadDate = product.latest_date ? new Date(product.latest_date).toLocaleDateString() : 'Never';
    document.getElementById('stat-last-upload').textContent = uploadDate;
    
    fetchFirmwareHistory(id);
}

async function fetchFirmwareHistory(productId) {
    try {
        const response = await fetch(`${API_URL}/products/${productId}/firmwares`);
        const history = await response.json();
        renderFirmwareHistory(history);
    } catch (error) {
        showToast('Failed to load firmware history', 'error');
        console.error(error);
    }
}

function renderFirmwareHistory(history) {
    const tbody = document.getElementById('firmware-history-body');
    tbody.innerHTML = '';
    
    if (history.length === 0) {
        const tr = document.createElement('tr');
        tr.innerHTML = `<td colspan="4" style="text-align:center;color:var(--text-secondary)">No firmware uploaded yet.</td>`;
        tbody.appendChild(tr);
        return;
    }
    
    history.forEach(fw => {
        const date = new Date(fw.upload_date).toLocaleString();
        const tr = document.createElement('tr');
        
        tr.innerHTML = `
            <td><strong>v${fw.version}</strong></td>
            <td>${fw.file_name}</td>
            <td>${date}</td>
            <td>
                <a href="${API_URL}/firmwares/download/${fw.id}" target="_blank" class="btn btn-sm btn-outline" style="width: auto; margin-right: 0.5rem">
                    <i class="fa-solid fa-download"></i> Download
                </a>
                <button class="btn btn-sm btn-outline" style="color: var(--danger); border-color: var(--danger); width: auto;" onclick="deleteFirmware(${fw.id})">
                    <i class="fa-solid fa-trash"></i>
                </button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

// Form Handlers
async function handleAddProduct(e) {
    e.preventDefault();
    const nameInput = document.getElementById('product-name');
    const msgBox = document.getElementById('add-product-msg');
    
    try {
        const response = await fetch(`${API_URL}/products`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: nameInput.value })
        });
        
        const data = await response.json();
        
        if (!response.ok) {
            msgBox.className = 'msg-box msg-error';
            msgBox.textContent = data.error || 'Failed to add product';
            return;
        }
        
        nameInput.value = '';
        msgBox.textContent = '';
        showToast('Product added successfully!');
        
        await fetchProducts();
        selectProduct(data.id);
        
    } catch (error) {
        msgBox.className = 'msg-box msg-error';
        msgBox.textContent = 'Network error. Make sure backend is running.';
    }
}

async function handleUploadFirmware(e) {
    e.preventDefault();
    if (!selectedProductId) return;
    
    const versionInput = document.getElementById('fw-version');
    const fileInput = document.getElementById('fw-file');
    const msgBox = document.getElementById('upload-msg');
    
    const formData = new FormData();
    formData.append('version', versionInput.value);
    formData.append('firmware', fileInput.files[0]);
    
    try {
        const btn = document.querySelector('#form-upload-firmware button');
        btn.disabled = true;
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Uploading...';
        
        const response = await fetch(`${API_URL}/products/${selectedProductId}/firmwares`, {
            method: 'POST',
            body: formData
        });
        
        const data = await response.json();
        
        btn.disabled = false;
        btn.innerHTML = '<i class="fa-solid fa-upload"></i> Upload';
        
        if (!response.ok) {
            msgBox.className = 'msg-box msg-error';
            msgBox.textContent = data.error || 'Failed to upload firmware';
            return;
        }
        
        hideUploadModal();
        showToast('Firmware uploaded successfully!');
        
        await fetchProducts(); // refreshes history and list
        
    } catch (error) {
        msgBox.className = 'msg-box msg-error';
        msgBox.textContent = 'Upload failed. File might be too large or backend is down.';
        console.error(error);
        
        const btn = document.querySelector('#form-upload-firmware button');
        btn.disabled = false;
        btn.innerHTML = '<i class="fa-solid fa-upload"></i> Upload';
    }
}

async function deleteCurrentProduct() {
    if (!selectedProductId) return;
    if (!confirm('Are you sure you want to delete this product and ALL its firmware files? This cannot be undone.')) return;
    
    try {
        const response = await fetch(`${API_URL}/products/${selectedProductId}`, {
            method: 'DELETE'
        });
        
        if (!response.ok) {
            const data = await response.json();
            showToast(data.error || 'Failed to delete product', 'error');
            return;
        }
        
        showToast('Product deleted successfully');
        hideAllViews();
        selectedProductId = null;
        await fetchProducts();
    } catch (error) {
        showToast('Network error while deleting product', 'error');
        console.error(error);
    }
}

async function deleteFirmware(id) {
    if (!confirm('Are you sure you want to delete this firmware file?')) return;
    
    try {
        const response = await fetch(`${API_URL}/firmwares/${id}`, {
            method: 'DELETE'
        });
        
        if (!response.ok) {
            const data = await response.json();
            showToast(data.error || 'Failed to delete firmware', 'error');
            return;
        }
        
        showToast('Firmware deleted successfully');
        await fetchProducts(); // Refreshes badge version logic
        if (selectedProductId) {
            fetchFirmwareHistory(selectedProductId);
        }
    } catch (error) {
        showToast('Network error while deleting firmware', 'error');
        console.error(error);
    }
}
