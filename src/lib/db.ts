// src/lib/db.js

import { openDB } from 'idb';

const DB_NAME = 'kanban-db';
const DB_VERSION = 1;

// Define our "tables"
const LISTS_STORE = 'lists';
const TASKS_STORE = 'tasks';
const SETTINGS_STORE = 'settings';
const ACTION_QUEUE_STORE = 'actionQueue';

// Initialize the database and create the object stores if they don't exist.
async function initDB() {
	const db = await openDB(DB_NAME, DB_VERSION, {
		upgrade(db) {
			if (!db.objectStoreNames.contains(LISTS_STORE)) {
				db.createObjectStore(LISTS_STORE, { keyPath: 'id' });
			}
			if (!db.objectStoreNames.contains(TASKS_STORE)) {
				const store = db.createObjectStore(TASKS_STORE, { keyPath: 'id' });
				// Create an index to easily find all tasks belonging to a specific list.
				store.createIndex('by-list', 'listId');
			}
			if (!db.objectStoreNames.contains(SETTINGS_STORE)) {
				db.createObjectStore(SETTINGS_STORE, { keyPath: 'key' });
			}
			if (!db.objectStoreNames.contains(ACTION_QUEUE_STORE)) {
				db.createObjectStore(ACTION_QUEUE_STORE, { autoIncrement: true, keyPath: 'id' });
			}
		},
	});
	return db;
}

// --- Generic Helper Functions ---
async function getStore(storeName, mode = 'readonly') {
	const db = await initDB();
	return db.transaction(storeName, mode).objectStore(storeName);
}

// --- Public Database Functions ---

// Settings
export async function getSettings() {
	const store = await getStore(SETTINGS_STORE);
	return await store.get('layout');
}

export async function saveSettings(settings) {
	const store = await getStore(SETTINGS_STORE, 'readwrite');
	return await store.put({ key: 'layout', ...settings });
}

// Lists
export async function saveLists(lists) {
	const store = await getStore(LISTS_STORE, 'readwrite');
	await store.clear(); // Clear old lists
	for (const list of lists) {
		await store.put(list);
	}
}

export async function getAllLocalLists() {
	const store = await getStore(LISTS_STORE);
	return await store.getAll();
}

// Tasks
export async function saveTasksForList(listId, tasks) {
	const store = await getStore(TASKS_STORE, 'readwrite');
	// First, delete all existing tasks for this list to ensure a clean slate.
	const tx = store.transaction;
	const index = tx.store.index('by-list');
	let cursor = await index.openCursor(listId);
	while (cursor) {
		store.delete(cursor.primaryKey);
		cursor = await cursor.continue();
	}

	// Now, add the new tasks.
	for (const task of tasks) {
		// Add the listId to each task so we can index it.
		await store.put({ ...task, listId });
	}
	await tx.done;
}

export async function getLocalTasksForList(listId) {
	const store = await getStore(TASKS_STORE);
	return await store.index('by-list').getAll(listId);
}

// Action Queue (for offline changes)
export async function addActionToQueue(action) {
	const store = await getStore(ACTION_QUEUE_STORE, 'readwrite');
	await store.add(action);
}

export async function getQueuedActions() {
	const store = await getStore(ACTION_QUEUE_STORE);
	return await store.getAll();
}

export async function deleteQueuedAction(actionId) {
	const store = await getStore(ACTION_QUEUE_STORE, 'readwrite');
	await store.delete(actionId);
}