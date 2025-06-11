// src/lib/graphService.js
import { getAccessTokenSilent } from './auth.js';

// --- Configuration ---
// This object defines your Kanban board structure.
// The keys are the column titles you'll see in the app.
// The values are the EXACT names of the lists in your Microsoft To Do.
const KANBAN_LIST_MAPPING = {
	'Inbox': 'Tasks', // The default list is often named 'Tasks'. Change if you renamed it.
	'To Do': 'To Do',
	'In Progress': 'In Progress',
	'Done': 'Done'
};
// --- End Configuration ---


/**
 * A helper function to make authenticated calls to the Microsoft Graph API.
 * @param {string} endpoint The Graph API endpoint to call.
 * @param {RequestInit} [options] Optional fetch options (e.g., method, headers, body).
 * @returns {Promise<any>} The JSON response from the API.
 */
async function fetchFromGraph(endpoint, options = {}) {
	const tokenResponse = await getAccessTokenSilent();
	if (!tokenResponse || !tokenResponse.accessToken) {
		throw new Error('Could not acquire access token.');
	}

	const defaultOptions = {
		headers: {
			Authorization: `Bearer ${tokenResponse.accessToken}`,
			'Content-Type': 'application/json'
		}
	};

	const fetchOptions = {
		...defaultOptions,
		...options,
		headers: {
			...defaultOptions.headers,
			...options.headers,
		}
	};

	const response = await fetch(endpoint, fetchOptions);

	if (!response.ok) {
		const errorData = await response.json().catch(() => ({ message: response.statusText }));
		throw new Error(`Graph API error: ${response.status} - ${errorData.error?.message || response.statusText}`);
	}

	if (response.status === 204) {
		return null; // Handle No Content responses for DELETE
	}
	return response.json();
}

/**
 * Fetches all necessary data for the Kanban board.
 */
export async function getKanbanData() {
	const allListsResponse = await fetchFromGraph('https://graph.microsoft.com/v1.0/me/todo/lists');
	const allLists = allListsResponse.value;

	const listIdMapping = {};
	for (const list of allLists) {
		if (Object.values(KANBAN_LIST_MAPPING).includes(list.displayName)) {
			listIdMapping[list.displayName] = list.id;
		}
	}

	const taskPromises = Object.entries(KANBAN_LIST_MAPPING).map(([columnName, listName]) => {
		const listId = listIdMapping[listName];
		if (!listId) {
			console.warn(`List "${listName}" for column "${columnName}" not found. It will be empty.`);
			return Promise.resolve({ columnName, listId: null, tasks: [] });
		}

		const tasksEndpoint = `https://graph.microsoft.com/v1.0/me/todo/lists/${listId}/tasks?$top=100`;
		return fetchFromGraph(tasksEndpoint)
			.then(result => ({
				columnName,
				listId,
				tasks: result.value || []
			}));
	});

	const results = await Promise.all(taskPromises);

	const kanbanData = {};
	for (const result of results) {
		kanbanData[result.columnName] = {
			listId: result.listId,
			tasks: result.tasks
		};
	}

	const orderedKanbanData = {};
	for (const columnName in KANBAN_LIST_MAPPING) {
		if (kanbanData[columnName]) {
			orderedKanbanData[columnName] = kanbanData[columnName];
		}
	}
	return orderedKanbanData;
}

/**
 * Creates a new task in a specified list.
 * @param {string} listId The ID of the list to create the task in.
 * @param {object} taskData The data for the original task.
 */
export async function createTask(listId, taskData) {
	const endpoint = `https://graph.microsoft.com/v1.0/me/todo/lists/${listId}/tasks`;
	// We only clone the properties that are safe to set on a new task.
	const payload = {
		title: taskData.title,
		importance: taskData.importance,
		// Optional: include body and dueDateTime if they exist
		...(taskData.body?.content && { body: { contentType: taskData.body.contentType, content: taskData.body.content } }),
		...(taskData.dueDateTime && { dueDateTime: taskData.dueDateTime }),
	};
	return await fetchFromGraph(endpoint, {
		method: 'POST',
		body: JSON.stringify(payload)
	});
}

/**
 * Deletes a task from a specified list.
 * @param {string} listId The ID of the list the task is in.
 * @param {string} taskId The ID of the task to delete.
 */
export async function deleteTask(listId, taskId) {
	const endpoint = `https://graph.microsoft.com/v1.0/me/todo/lists/${listId}/tasks/${taskId}`;
	// DELETE requests expect a 204 No Content response, which our helper handles.
	await fetchFromGraph(endpoint, {
		method: 'DELETE'
	});
}