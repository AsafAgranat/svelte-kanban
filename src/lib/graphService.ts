// src/lib/graphService.js
import { getAccessTokenSilent } from './auth.js';

const FILES_SCOPES = ['Files.ReadWrite.AppFolder'];
const TASKS_SCOPES = ['Tasks.ReadWrite'];

/**
 * A generic helper function to make authenticated calls to the Microsoft Graph API.
 */
async function fetchFromGraph(endpoint, options = {}, tokenScopes = ['Tasks.Read']) {
	const tokenResponse = await getAccessTokenSilent({ scopes: tokenScopes });
	if (!tokenResponse || !tokenResponse.accessToken) {
		throw new Error('Could not acquire access token.');
	}	
	const defaultOptions = {
		headers: {
			Authorization: `Bearer ${tokenResponse.accessToken}`,
			'Content-Type': 'application/json'
		}
	};
	const fetchOptions = { ...defaultOptions, ...options, headers: { ...defaultOptions.headers, ...options.headers } };
	const response = await fetch(endpoint, fetchOptions);

	// This is now a generic helper. It will throw an error for ANY non-successful response.
	if (!response.ok) {
		const errorData = await response.json().catch(() => ({ message: response.statusText }));
		// We pass the status code along for more specific error handling.
		const error = new Error(`Graph API error: ${response.status} - ${errorData.error?.message || response.statusText}`);
		error.statusCode = response.status;
		throw error;
	}

	if (response.status === 204) return null;
	const contentType = response.headers.get("content-type");
	if (contentType && contentType.indexOf("application/json") !== -1) {
		return response.json();
	}
	
	return response.text();
}

// --- List and Task Functions ---
export async function getAllUserLists() {
	const response = await fetchFromGraph('https://graph.microsoft.com/v1.0/me/todo/lists', {}, TASKS_SCOPES);
	console.log(response.value);
	
	return response.value || [];
}
export async function getTasksForList(listId) {
	if (!listId) return [];
	const endpoint = `https://graph.microsoft.com/v1.0/me/todo/lists/${listId}/tasks?$top=100`;
	const response = await fetchFromGraph(endpoint, {}, TASKS_SCOPES);
	return response.value || [];
}
export async function createTask(listId, taskData) {
	const endpoint = `https://graph.microsoft.com/v1.0/me/todo/lists/${listId}/tasks`;
	const payload = {
		title: taskData.title,
		importance: taskData.importance,
		...(taskData.body?.content && { body: { contentType: taskData.body.contentType, content: taskData.body.content } }),
		...(taskData.dueDateTime && { dueDateTime: taskData.dueDateTime }),
	};
	return await fetchFromGraph(endpoint, { method: 'POST', body: JSON.stringify(payload) }, TASKS_SCOPES);
}

export async function deleteTask(listId, taskId) {
	const endpoint = `https://graph.microsoft.com/v1.0/me/todo/lists/${listId}/tasks/${taskId}`;
	try {
		await fetchFromGraph(endpoint, { method: 'DELETE' }, TASKS_SCOPES);
	} catch (error) {
		// Specifically catch the 404 error and treat it as a success for this operation.
		if (error.statusCode === 404) {
			console.log(`Task ${taskId} was already deleted by the server. This is okay.`);
			return; // Exit gracefully
		}
		// For any other error, re-throw it so the sync queue knows something went wrong.
		throw error;
	}
}


// --- List Management Functions ---
export async function createList(listName) {
	const endpoint = 'https://graph.microsoft.com/v1.0/me/todo/lists';
	const payload = { displayName: listName };
	return await fetchFromGraph(endpoint, { method: 'POST', body: JSON.stringify(payload) }, TASKS_SCOPES);
}

export async function deleteList(listId) {
	const endpoint = `https://graph.microsoft.com/v1.0/me/todo/lists/${listId}`;
	await fetchFromGraph(endpoint, { method: 'DELETE' }, TASKS_SCOPES);
}


// --- App Settings Functions ---
export async function saveAppSettings(settings) {
	const endpoint = `https://graph.microsoft.com/v1.0/me/drive/special/approot:/settings.json:/content`;
	await fetchFromGraph(endpoint, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(settings) }, FILES_SCOPES);
}

export async function getAppSettings() {
	const endpoint = `https://graph.microsoft.com/v1.0/me/drive/special/approot:/settings.json:/content`;
	try {
		const responseText = await fetchFromGraph(endpoint, {}, FILES_SCOPES, 'text');
		if (!responseText) return null;
		return JSON.parse(responseText);
	} catch (error) {
		if (error.statusCode === 404) return null;
		throw error;
	}
}