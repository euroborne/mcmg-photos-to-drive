import React, { useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import './App.css';
import {
  Folder,
  User,
  Image as ImageIcon,
  CheckCircle,
  XCircle,
  Loader2,
  Cloud,
} from 'lucide-react';

// Make sure to add this script to your HTML for Google Identity Services
// <script src="https://accounts.google.com/gsi/client" async defer></script>
// This is automatically handled by the runtime environment.

// --- CONFIGURATION ---
// IMPORTANT: REPLACE THIS WITH YOUR GOOGLE DRIVE FOLDER ID
const PARENT_FOLDER_ID = 'YOUR_STATIC_PARENT_FOLDER_ID';
// You can find the folder ID in the URL of your shared Drive folder.
// e.g., https://drive.google.com/drive/folders/YOUR_STATIC_PARENT_FOLDER_ID

const App = () => {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [userProfile, setUserProfile] = useState(null);
  const [accessToken, setAccessToken] = useState(null);
  const [formInputs, setFormInputs] = useState({
    title: '',
    description: '',
    photographer: '',
  });
  const [files, setFiles] = useState([]);
  const [status, setStatus] = useState({ message: '', type: '' });
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Initialize Google Identity Services
  useEffect(() => {
    // Check if the Google API script is loaded
    if (typeof window.google !== 'undefined' && window.google.accounts) {
      window.google.accounts.id.initialize({
        client_id: "683777770878-l64d856t4s627n3h8g5j4f6d3n2k6b1a.apps.googleusercontent.com", // This will be provided by the runtime
        callback: handleCredentialResponse,
        scope: "https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/userinfo.profile",
        prompt_parent_id: "google-signin-button-container"
      });
      window.google.accounts.id.prompt();
    }
  }, []);

  const handleCredentialResponse = (response) => {
    // This function handles the sign-in response
    const { credential } = response;
    const decodedToken = JSON.parse(atob(credential.split('.')[1]));
    
    // Store access token and user info
    setAccessToken(credential);
    setUserProfile(decodedToken);
    
    // Pre-fill the photographer name
    const fullName = `${decodedToken.given_name || ''} ${decodedToken.family_name || ''}`;
    setFormInputs(prev => ({ ...prev, photographer: fullName.trim() }));
    setIsLoggedIn(true);
    
    // Initialize the Google API client
    gapi.load('client', () => {
      gapi.client.setToken({ access_token: credential });
      gapi.client.load('drive', 'v3');
    });
  };

  const handleFileChange = (e) => {
    const selectedFiles = e.target.files;
    const newFiles = Array.from(selectedFiles);
    
    // Enforce max file count and size
    const validFiles = newFiles.filter(file => {
      const isImage = file.type.startsWith('image/');
      const isValidSize = file.size <= 50 * 1024 * 1024; // 50 MB
      if (!isImage) {
        setStatus({ message: `File "${file.name}" is not an image. Only image files are allowed.`, type: 'error' });
      } else if (!isValidSize) {
        setStatus({ message: `File "${file.name}" exceeds the 50 MB size limit.`, type: 'error' });
      }
      return isImage && isValidSize;
    });

    if (files.length + validFiles.length > 100) {
      setStatus({ message: `You can only upload a maximum of 100 photos.`, type: 'error' });
      setFiles(validFiles.slice(0, 100));
    } else {
      setFiles(prevFiles => [...prevFiles, ...validFiles]);
      setStatus({ message: '', type: '' });
    }
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    // Enforce 25-character limit for the title
    if (name === 'title' && value.length > 25) {
      setStatus({ message: `Submission Title cannot exceed 25 characters.`, type: 'error' });
      return;
    }
    setStatus({ message: '', type: '' });
    setFormInputs(prev => ({ ...prev, [name]: value }));
  };

  const removeFile = (indexToRemove) => {
    setFiles(prevFiles => prevFiles.filter((_, index) => index !== indexToRemove));
  };

  const getOrCreateFolder = async (parentFolderId, folderName) => {
    // Check if the folder already exists
    const query = `'${parentFolderId}' in parents and name = '${folderName}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
    const response = await gapi.client.drive.files.list({
      q: query,
      fields: 'files(id)',
    });

    if (response.result.files.length > 0) {
      // Folder exists, return its ID
      return response.result.files[0].id;
    } else {
      // Folder does not exist, create it
      const folderMetadata = {
        'name': folderName,
        'mimeType': 'application/vnd.google-apps.folder',
        'parents': [parentFolderId]
      };
      const createResponse = await gapi.client.drive.files.create({
        resource: folderMetadata,
        fields: 'id',
      });
      return createResponse.result.id;
    }
  };
  
  const uploadFiles = async (folderId) => {
    const uploadPromises = files.map(file => {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = async () => {
          try {
            const description = formInputs.description;
            const fileContent = reader.result;

            const metadata = {
              'name': file.name,
              'mimeType': file.type,
              'description': description,
              'parents': [folderId],
            };

            const media = {
              mimeType: file.type,
              body: file,
            };

            const request = gapi.client.request({
              'path': 'https://www.googleapis.com/upload/drive/v3/files',
              'method': 'POST',
              'params': { 'uploadType': 'multipart' },
              'headers': {
                'Authorization': `Bearer ${accessToken}`,
              },
              'body': media,
            });

            const uploadResponse = await request;
            console.log('File uploaded:', uploadResponse.result);
            resolve(uploadResponse.result);

          } catch (error) {
            reject(error);
          }
        };
        reader.onerror = (error) => reject(error);
        reader.readAsArrayBuffer(file);
      });
    });

    return Promise.all(uploadPromises);
  };
  
  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    setStatus({ message: 'Submitting...', type: 'info' });

    if (!isLoggedIn) {
      setStatus({ message: 'You must be logged in to submit.', type: 'error' });
      setIsSubmitting(false);
      return;
    }

    if (files.length === 0) {
      setStatus({ message: 'Please attach at least one photo.', type: 'error' });
      setIsSubmitting(false);
      return;
    }
    
    if (!formInputs.title || !formInputs.description || !formInputs.photographer) {
      setStatus({ message: 'Please fill in all required fields.', type: 'error' });
      setIsSubmitting(false);
      return;
    }

    try {
      // Create the subfolder name
      const subfolderName = `${formInputs.title} - ${formInputs.photographer}`;

      // Get or create the subfolder using the static ID
      const subfolderId = await getOrCreateFolder(PARENT_FOLDER_ID, subfolderName);

      // Upload all files to the new subfolder
      await uploadFiles(subfolderId);

      setStatus({ message: `Success! Your photos have been uploaded to the folder "${subfolderName}".`, type: 'success' });
      setFiles([]);
      setFormInputs(prev => ({ ...prev, title: '', description: '' }));
    } catch (error) {
      console.error('Submission failed:', error);
      setStatus({ message: `An error occurred: ${error.message || JSON.stringify(error)}`, type: 'error' });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col min-h-screen bg-gray-100 p-4 sm:p-8 font-sans antialiased">
      <div className="max-w-4xl mx-auto w-full bg-white shadow-lg rounded-xl p-6 sm:p-10 transition-all duration-300">
        
        {/* Header and User Info */}
        <div className="flex flex-col sm:flex-row justify-between items-center mb-8 pb-4 border-b border-gray-200">
          <div className="flex items-center space-x-4 mb-4 sm:mb-0">
            <Cloud className="w-12 h-12 text-blue-500" />
            <h1 className="text-3xl sm:text-4xl font-extrabold text-gray-800 tracking-tight">Photo Uploader</h1>
          </div>
          <div id="google-signin-button-container" className="text-right">
            {!isLoggedIn && (
              <div
                className="inline-block bg-blue-600 text-white font-semibold py-2 px-4 rounded-full shadow-md hover:bg-blue-700 transition-colors cursor-pointer"
                onClick={() => window.google.accounts.id.prompt()}>
                Sign in with Google
              </div>
            )}
            {userProfile && (
              <div className="flex items-center space-x-2 text-gray-600">
                <User className="w-5 h-5" />
                <span>{userProfile.given_name}</span>
                <span className="text-sm text-gray-400">({userProfile.email})</span>
              </div>
            )}
          </div>
        </div>

        {/* Instructions and Form */}
        <div className="space-y-6">
          <p className="text-gray-600 leading-relaxed">
            Please fill out the form below to upload your photos. Your files will be securely saved to a dedicated Google Drive folder, with the description you provide attached to each image.
          </p>
          
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Photographer's Name Field */}
              <div className="flex flex-col">
                <label htmlFor="photographer" className="text-sm font-medium text-gray-700 mb-1 flex items-center">
                  <User className="w-4 h-4 mr-2" />
                  Photographer's Name
                </label>
                <input
                  type="text"
                  id="photographer"
                  name="photographer"
                  value={formInputs.photographer}
                  onChange={handleInputChange}
                  readOnly={!isLoggedIn}
                  className="w-full p-3 border border-gray-300 rounded-lg shadow-sm focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-200 disabled:text-gray-500"
                />
              </div>

              {/* Submission Title Field */}
              <div className="flex flex-col">
                <label htmlFor="title" className="text-sm font-medium text-gray-700 mb-1 flex items-center">
                  <Folder className="w-4 h-4 mr-2" />
                  Submission Title
                </label>
                <input
                  type="text"
                  id="title"
                  name="title"
                  value={formInputs.title}
                  onChange={handleInputChange}
                  placeholder="e.g., Garden Discovery Day"
                  required
                  maxLength="25"
                  className="w-full p-3 border border-gray-300 rounded-lg shadow-sm focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
            </div>

            {/* Photo Description Field */}
            <div className="flex flex-col">
              <label htmlFor="description" className="text-sm font-medium text-gray-700 mb-1 flex items-center">
                <ImageIcon className="w-4 h-4 mr-2" />
                Brief Description of Photos
              </label>
              <textarea
                id="description"
                name="description"
                value={formInputs.description}
                onChange={handleInputChange}
                rows="4"
                placeholder="A short story about the photos you're submitting."
                required
                className="w-full p-3 border border-gray-300 rounded-lg shadow-sm focus:ring-blue-500 focus:border-blue-500"
              ></textarea>
            </div>

            {/* File Upload Section */}
            <div>
              <label className="text-sm font-medium text-gray-700 mb-1 flex items-center">
                <ImageIcon className="w-4 h-4 mr-2" />
                Upload Photos (Max 100 files, 50 MB each)
              </label>
              <div className="mt-2 flex justify-center items-center w-full px-6 pt-5 pb-6 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:border-blue-500 transition-colors">
                <input
                  id="file-upload"
                  name="file-upload"
                  type="file"
                  multiple
                  accept="image/*"
                  onChange={handleFileChange}
                  className="sr-only"
                />
                <label htmlFor="file-upload" className="flex flex-col items-center w-full cursor-pointer">
                  <ImageIcon className="mx-auto h-12 w-12 text-gray-400" />
                  <span className="mt-2 text-sm text-gray-600">
                    <span className="font-medium text-blue-600 hover:text-blue-500">
                      Click to upload
                    </span>
                    {' '}or drag and drop
                  </span>
                  <p className="mt-1 text-xs text-gray-500">PNG, JPG, GIF up to 50MB</p>
                </label>
              </div>
            </div>

            {/* File List */}
            {files.length > 0 && (
              <div className="file-section">
                <h3 className="section-title">Selected Files ({files.length}/100)</h3>
                <div className="file-list">
                  {files.map((file, index) => (
                    <div key={index} className="file-item">
                      <div className="file-preview">
                        {file.type.startsWith('image/') ? (
                          <img
                            src={URL.createObjectURL(file)}
                            alt={file.name}
                            onLoad={(e) => URL.revokeObjectURL(e.target.src)}
                          />
                        ) : (
                          <ImageIcon className="placeholder-icon" />
                        )}
                      </div>
                      <div className="file-info">
                        <div>
                          <div className="file-name">{file.name}</div>
                          <div className="file-size">({(file.size / (1024 * 1024)).toFixed(2)} MB)</div>
                        </div>
                        <button
                          type="button"
                          onClick={() => removeFile(index)}
                          className="remove-button"
                          aria-label={`Remove ${file.name}`}
                        >
                          <XCircle className="icon" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            
            {/* Submission Status Message */}
            {status.message && (
              <div className={`p-4 rounded-lg flex items-center space-x-3 ${
                status.type === 'success' ? 'bg-green-100 text-green-700' :
                status.type === 'error' ? 'bg-red-100 text-red-700' :
                'bg-blue-100 text-blue-700'
              }`}>
                {status.type === 'success' && <CheckCircle className="w-5 h-5" />}
                {status.type === 'error' && <XCircle className="w-5 h-5" />}
                {status.type === 'info' && <Loader2 className="w-5 h-5 animate-spin" />}
                <span className="text-sm">{status.message}</span>
              </div>
            )}
            
            {/* Submit Button */}
            <div className="pt-4">
              <button
                type="submit"
                disabled={!isLoggedIn || isSubmitting || files.length === 0}
                className="w-full px-6 py-3 font-bold text-white bg-blue-600 rounded-lg shadow-md hover:bg-blue-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed"
              >
                {isSubmitting ? (
                  <span className="flex items-center justify-center">
                    <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                    Uploading...
                  </span>
                ) : (
                  'Submit Photos'
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default App;
