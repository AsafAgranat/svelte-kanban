// src/lib/syncService.js

import {
	getAllUserLists,
	getTasksForList,
	createTask,
	deleteTask,
	createList,
	deleteList
} from './graphService';
import {
	saveLists,
	saveTasksForList,
	addActionToQueue,
	getQueuedActions,
	deleteQueuedAction
} from './db';

let isSyncing = false;

export async function syncWithServer() {
	if (isSyncing) {
		console.log('Sync already in progress. Skipping.');
		return false;
	}

	console.log('Starting sync with server...');
	isSyncing = true;

	try {
		await processActionQueue();

		const allLists = await getAllUserLists();
		await saveLists(allLists);

		const taskPromises = allLists.map(list =>
			getTasksForList(list.id).then(tasks => saveTasksForList(list.id, tasks))
		);

		await Promise.all(taskPromises);

		console.log('Sync completed successfully.');
		return true;

	} catch (error) {
		console.error('Sync failed:', error);
		return false;
	} finally {
		isSyncing = false;
	}
}

async function processActionQueue() {
	const queuedActions = await getQueuedActions();
	if (queuedActions.length === 0) return;

	console.log(`Processing ${queuedActions.length} queued actions...`);

	for (const action of queuedActions) {
		try {
			if (action.type === 'moveTask') {
				await createTask(action.payload.destinationListId, action.payload.taskToMove);
				await deleteTask(action.payload.sourceListId, action.payload.taskToMove.id);
			}
			else if (action.type === 'createList') {
				await createList(action.payload.listName);
			}
			else if (action.type === 'deleteList') {
				await deleteList(action.payload.listId);
			}

			await deleteQueuedAction(action.id);
			console.log(`Action ${action.id} (${action.type}) processed successfully.`);
		} catch (error) {
			console.error(`Failed to process action ${action.id}. It will be retried on next sync.`, error);
			break;
		}
	}
}