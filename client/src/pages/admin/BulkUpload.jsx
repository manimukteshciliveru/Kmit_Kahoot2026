import { useState } from 'react';
import { Link } from 'react-router-dom';
import { userAPI } from '../../services/api';
import {
    FiUpload,
    FiArrowLeft,
    FiDownload,
    FiCheck,
    FiX,
    FiAlertCircle,
    FiUsers,
    FiFileText
} from 'react-icons/fi';
import toast from 'react-hot-toast';
import '../Dashboard.css';
import './AdminPages.css';

const BulkUpload = () => {
    const [file, setFile] = useState(null);
    const [previewData, setPreviewData] = useState(null);
    const [uploading, setUploading] = useState(false);
    const [uploadResult, setUploadResult] = useState(null);
    const [accountType, setAccountType] = useState('student');

    const handleFileChange = (e) => {
        const selectedFile = e.target.files[0];
        if (selectedFile) {
            setFile(selectedFile);
            setUploadResult(null);
            parseFilePreview(selectedFile);
        }
    };

    const parseFilePreview = async (file) => {
        // For CSV files, we can preview the first few rows
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const text = e.target.result;
                const lines = text.split('\n').filter(line => line.trim());
                const headers = lines[0].split(',').map(h => h.trim().toLowerCase());

                const preview = lines.slice(1, 6).map(line => {
                    const values = line.split(',').map(v => v.trim());
                    const row = {};
                    headers.forEach((h, i) => {
                        row[h] = values[i] || '';
                    });
                    return row;
                });

                setPreviewData({
                    headers,
                    rows: preview,
                    totalRows: lines.length - 1
                });
            } catch (error) {
                console.error('Parse error:', error);
                toast.error('Failed to parse file. Please ensure it\'s a valid CSV.');
            }
        };
        reader.readAsText(file);
    };

    const handleUpload = async () => {
        if (!file) {
            toast.error('Please select a file first');
            return;
        }

        setUploading(true);
        const formData = new FormData();
        formData.append('file', file);
        formData.append('accountType', accountType);

        try {
            const response = await userAPI.bulkCreate(formData);
            setUploadResult(response.data);
            toast.success(`Successfully created ${response.data.created} users!`);
            setFile(null);
            setPreviewData(null);
        } catch (error) {
            console.error('Upload failed:', error);
            toast.error(error.response?.data?.message || 'Upload failed');
            if (error.response?.data?.errors) {
                setUploadResult({ errors: error.response.data.errors, created: 0 });
            }
        } finally {
            setUploading(false);
        }
    };

    const downloadTemplate = () => {
        const headers = accountType === 'student'
            ? 'name,rollnumber,section,department,phone'
            : 'name,employeeid,designation,department,phone';

        const example = accountType === 'student'
            ? 'John Doe,22BD1A0501,A,CSE,9876543210'
            : 'Jane Smith,FAC001,Assistant Professor,CSE,9876543210';

        const csv = `${headers}\n${example}`;
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${accountType}_template.csv`;
        a.click();
        window.URL.revokeObjectURL(url);
    };

    return (
        <div className="admin-page">
            <div className="page-header">
                <div className="header-left">
                    <Link to="/users" className="back-btn">
                        <FiArrowLeft /> Back to Users
                    </Link>
                    <h1><FiUpload /> Bulk Upload Users</h1>
                </div>
            </div>

            <div className="bulk-upload-container">
                {/* Account Type Selection */}
                <div className="upload-section">
                    <h3>Step 1: Select Account Type</h3>
                    <div className="account-type-toggle">
                        <button
                            className={`toggle-btn ${accountType === 'student' ? 'active' : ''}`}
                            onClick={() => setAccountType('student')}
                        >
                            <FiUsers /> Students
                        </button>
                        <button
                            className={`toggle-btn ${accountType === 'faculty' ? 'active' : ''}`}
                            onClick={() => setAccountType('faculty')}
                        >
                            <FiUsers /> Teachers
                        </button>
                    </div>
                </div>

                {/* Template Download */}
                <div className="upload-section">
                    <h3>Step 2: Download Template</h3>
                    <p className="section-desc">
                        Download the CSV template, fill in the {accountType} details, then upload.
                    </p>
                    <button onClick={downloadTemplate} className="btn btn-secondary">
                        <FiDownload /> Download {accountType === 'student' ? 'Student' : 'Teacher'} Template
                    </button>
                    <div className="template-info">
                        <h4>Required Columns:</h4>
                        {accountType === 'student' ? (
                            <ul>
                                <li><strong>name</strong> - Full name of the student</li>
                                <li><strong>rollnumber</strong> - Student ID / Roll Number</li>
                                <li><strong>section</strong> - Section (A, B, C, etc.)</li>
                                <li><strong>department</strong> - Department (CSE, ECE, etc.)</li>
                                <li><strong>phone</strong> - Phone number (optional)</li>
                            </ul>
                        ) : (
                            <ul>
                                <li><strong>name</strong> - Full name of the teacher</li>
                                <li><strong>employeeid</strong> - Employee ID</li>
                                <li><strong>designation</strong> - Designation (Professor, etc.)</li>
                                <li><strong>department</strong> - Department</li>
                                <li><strong>phone</strong> - Phone number (optional)</li>
                            </ul>
                        )}
                        <div className="password-note">
                            <FiAlertCircle />
                            <span>
                                <strong>Auto-generated Password:</strong> Each user will get a default password
                                format: <code>{accountType === 'student' ? 'rollnumber@123' : 'employeeid@123'}</code>
                                <br />
                                Users can change their password after first login.
                            </span>
                        </div>
                    </div>
                </div>

                {/* File Upload */}
                <div className="upload-section">
                    <h3>Step 3: Upload File</h3>
                    <div className="file-drop-zone">
                        <input
                            type="file"
                            id="bulk-file"
                            accept=".csv,.xlsx,.xls"
                            onChange={handleFileChange}
                        />
                        <label htmlFor="bulk-file" className="drop-label">
                            <FiFileText className="drop-icon" />
                            {file ? (
                                <span className="file-name">{file.name}</span>
                            ) : (
                                <>
                                    <span>Click to select CSV or Excel file</span>
                                    <small>Supports .csv, .xlsx, .xls</small>
                                </>
                            )}
                        </label>
                    </div>
                </div>

                {/* Preview */}
                {previewData && (
                    <div className="upload-section">
                        <h3>Preview ({previewData.totalRows} rows found)</h3>
                        <div className="preview-table-container">
                            <table className="preview-table">
                                <thead>
                                    <tr>
                                        {previewData.headers.map((h, i) => (
                                            <th key={i}>{h}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {previewData.rows.map((row, i) => (
                                        <tr key={i}>
                                            {previewData.headers.map((h, j) => (
                                                <td key={j}>{row[h] || '-'}</td>
                                            ))}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        {previewData.totalRows > 5 && (
                            <p className="preview-note">Showing first 5 rows of {previewData.totalRows}</p>
                        )}
                    </div>
                )}

                {/* Upload Button */}
                {file && (
                    <div className="upload-section">
                        <button
                            onClick={handleUpload}
                            className="btn btn-primary btn-lg"
                            disabled={uploading}
                        >
                            {uploading ? (
                                <><span className="spinner spinner-sm"></span> Uploading...</>
                            ) : (
                                <><FiUpload /> Upload and Create Users</>
                            )}
                        </button>
                    </div>
                )}

                {/* Results */}
                {uploadResult && (
                    <div className="upload-section">
                        <h3>Upload Results</h3>
                        <div className={`result-box ${uploadResult.created > 0 ? 'success' : 'error'}`}>
                            {uploadResult.created > 0 && (
                                <div className="result-item success">
                                    <FiCheck /> {uploadResult.created} users created successfully
                                </div>
                            )}
                            {uploadResult.skipped > 0 && (
                                <div className="result-item warning">
                                    <FiAlertCircle /> {uploadResult.skipped} rows skipped (already exist or invalid)
                                </div>
                            )}
                            {uploadResult.errors && uploadResult.errors.length > 0 && (
                                <div className="errors-list">
                                    <h4>Errors:</h4>
                                    {uploadResult.errors.slice(0, 10).map((err, i) => (
                                        <div key={i} className="result-item error">
                                            <FiX /> Row {err.row}: {err.message}
                                        </div>
                                    ))}
                                    {uploadResult.errors.length > 10 && (
                                        <p>...and {uploadResult.errors.length - 10} more errors</p>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default BulkUpload;
