<script>
  import { onMount } from 'svelte';
  import { authState, login } from '$lib/auth.js';
  import { 
    getAllUserLists, 
    getTasksForList, 
    createTask, 
    deleteTask, 
    saveAppSettings, 
    getAppSettings,
    createList,
    deleteList
  } from '$lib/graphService.js';
  import { 
    getSettings, 
    saveSettings as saveLocalSettings, 
    getAllLocalLists, 
    getLocalTasksForList, 
    addActionToQueue 
  } from '$lib/db.js';
  import { syncWithServer } from '$lib/syncService.js';

  // --- Svelte 5 State Management ---
  let isLoading = $state(true);
  let isSyncing = $state(false);
  let error = $state(null);
  let movingTaskId = $state(null);
  
  let allUserLists = $state([]);
  let kanbanColumns = $state([]);

  let showAddColumnInput = $state(false);
  let newColumnName = $state("");
  let confirmDeleteIndex = $state(-1);

  const shownListIds = $derived(new Set(kanbanColumns.map(c => c.listId)));
  const availableListsToAdd = $derived(allUserLists.filter(l => !shownListIds.has(l.id)));

  /**
   * Loads the entire board state ONLY from the local database.
   */
  async function loadBoardFromLocalDB() {
    isSyncing = true;
    try {
      const [allLists, savedSettings] = await Promise.all([
        getAllLocalLists(),
        getSettings()
      ]);

      allUserLists = allLists;

      let listIdsToLoad = [];
      if (savedSettings && savedSettings.columnListIds) {
        listIdsToLoad = savedSettings.columnListIds;
      } else {
        const defaultListNames = ['Jobs Postings', 'Jobs In Progress', 'Jobs Sent', 'Jobs Declined'];
        listIdsToLoad = defaultListNames
          .map(name => allLists.find(l => l.displayName === name)?.id)
          .filter(Boolean);
      }

      const columnPromises = listIdsToLoad.map(async (listId) => {
        const list = allLists.find(l => l.id === listId);
        if (list) {
          const tasks = await getLocalTasksForList(listId);
          return { displayName: list.displayName, listId: list.id, tasks: tasks };
        }
        return null;
      });

      kanbanColumns = (await Promise.all(columnPromises)).filter(Boolean);
    } catch (e) {
      error = `Error loading data from local database: ${e.message}`;
    } finally {
      setTimeout(() => isSyncing = false, 4000); 
    }
  }
  
  /**
   * Handles when a user selects a new list for a column from the dropdown.
   */
  async function handleColumnChange(columnIndex, event) {
    const selectedListId = event.target.value;
    const selectedList = allUserLists.find(l => l.id === selectedListId);
    if (!selectedList) return;
    
    const oldColumn = kanbanColumns[columnIndex];
    kanbanColumns[columnIndex] = {
        displayName: selectedList.displayName,
        listId: selectedList.id,
        tasks: []
    };

    try {
        isSyncing = true;
        const tasks = await getLocalTasksForList(selectedListId);
        kanbanColumns[columnIndex].tasks = tasks;
        await persistColumnLayout();
    } catch(e) {
        error = `Failed to load tasks for ${selectedList.displayName}: ${e.message}`;
        kanbanColumns[columnIndex] = oldColumn;
    } finally {
        isSyncing = false;
    }
  }

  // --- Functions to add/remove columns ---
  async function handleAddColumnSubmit(event) {
    event.preventDefault();
    const listName = newColumnName.trim();
    if (!listName) {
      showAddColumnInput = false;
      return;
    }
    
    showAddColumnInput = false;
    newColumnName = "";
    isSyncing = true;
    
    try {
      await addActionToQueue({ type: 'createList', payload: { listName } });
      const syncSuccess = await syncWithServer();
      if (syncSuccess) {
        await loadBoardFromLocalDB();
      } else {
        throw new Error("Sync failed. New list will be created on next successful sync.");
      }
    } catch(e) {
      error = `Failed to create list: ${e.message}`;
    }
  }

  async function handleRemoveColumn(columnIndex, listId) {
    confirmDeleteIndex = -1;
    isSyncing = true;
    
    const removedColumn = kanbanColumns[columnIndex];
    kanbanColumns = kanbanColumns.filter((_, i) => i !== columnIndex);

    try {
      await addActionToQueue({ type: 'deleteList', payload: { listId } });
      await persistColumnLayout();
      await syncWithServer();
    } catch (e) {
      error = `Failed to delete list: ${e.message}`;
      kanbanColumns.splice(columnIndex, 0, removedColumn);
    } finally {
      isSyncing = false;
    }
  }

  async function persistColumnLayout() {
    const columnListIds = kanbanColumns.map(c => c.listId);
    await saveLocalSettings({ columnListIds });
    syncWithServer();
  }

  // --- Drag and Drop Logic ---
  function handleDragStart(event, task) {
    event.dataTransfer.setData('text/plain', task.id);
    event.dataTransfer.effectAllowed = 'move';
  }

  function handleDragOver(event) {
    event.preventDefault();
  }

  async function handleDrop(event, destinationColumnIndex) {
    event.preventDefault();
    const taskId = event.dataTransfer.getData('text/plain');
    if (!taskId) return;

    let sourceListId = null, taskToMove = null, sourceColumnIndex = -1;
    for (const [i, column] of kanbanColumns.entries()) {
      const foundTask = column.tasks.find(t => t.id === taskId);
      if (foundTask) {
        sourceListId = column.listId;
        taskToMove = foundTask;
        sourceColumnIndex = i;
        break;
      }
    }
    const destinationListId = kanbanColumns[destinationColumnIndex]?.listId;
    if (!taskToMove || !sourceListId || !destinationListId || sourceListId === destinationListId) return;
    if (taskToMove.recurrence) { error = "Error: Cannot move a recurring task."; return; }

    // Optimistic UI Update
    kanbanColumns[sourceColumnIndex].tasks = kanbanColumns[sourceColumnIndex].tasks.filter(t => t.id !== taskId);
    kanbanColumns[destinationColumnIndex].tasks.push(taskToMove);

    const sanitizedTask = JSON.parse(JSON.stringify(taskToMove));

    await addActionToQueue({
      type: 'moveTask',
      payload: { 
        sourceListId, 
        destinationListId, 
        taskToMove: sanitizedTask
      }
    });
    syncWithServer();
  }
  
  // --- Lifecycle and Effects ---
  onMount(() => {
    let initialSyncDone = false;
    
    // --- THIS IS THE ROBUST FIX ---
    // The handler function is now defined INSIDE onMount, so it has access
    // to the `loadBoardFromLocalDB` function in its scope.
    const handleFocus = async () => {
      if (document.visibilityState === 'visible' && $authState.isAuthenticated) {
        console.log('Window focused, attempting sync...');
        const updated = await syncWithServer();
        if (updated) await loadBoardFromLocalDB();
      }
    };

    // Add the event listeners.
    document.addEventListener('visibilitychange', handleFocus);
    window.addEventListener('focus', handleFocus);
    
    // Subscribe to the auth store to trigger the initial load.
    const unsubscribe = authState.subscribe(async (state) => {
      if (state.isReady && state.isAuthenticated && !initialSyncDone) {
        initialSyncDone = true;
        isLoading = true;
        await syncWithServer();
        await loadBoardFromLocalDB();
        isLoading = false;
      } else if (state.isReady && !state.isAuthenticated) {
        isLoading = false;
      }
    });
    
    // Return a cleanup function to remove listeners when the component is destroyed.
    return () => {
      document.removeEventListener('visibilitychange', handleFocus);
      window.removeEventListener('focus', handleFocus);
      unsubscribe();
    };
  });

</script>

<div class="page-container">
  {#if isSyncing && !isLoading}
    <div class="toast">Syncing...</div>
  {/if}

  {#if !$authState.isReady || isLoading}
    <p class="loading-message">{isLoading ? 'Loading Kanban board...' : 'Initializing...'}</p>
  {:else if !$authState.isAuthenticated}
    <div class="center-stage">
      <h1>Welcome to your Kanban Board</h1>
      <p>Please log in with your Microsoft account to view your tasks.</p>
      <button class="login-button" onclick={login}>Login with Microsoft</button>
    </div>
  {:else if error}
    <div class="error-container">
        <p class="error-message">{error}</p>
        <button onclick={() => syncWithServer().then(loadBoardFromLocalDB)}>Retry</button>
    </div>
  {:else}
    <div class="kanban-board">
      {#each kanbanColumns as column, i (column.listId)}
        <div class="kanban-column"
             ondragover={handleDragOver}
             ondrop={(event) => handleDrop(event, i)}>
          <div class="column-header">
            {#if confirmDeleteIndex === i}
                <button class="confirm-delete-btn" onclick={() => handleRemoveColumn(i, column.listId)}>Delete?</button>
                <button class="cancel-delete-btn" onclick={() => confirmDeleteIndex = -1}>Cancel</button>
            {:else}
                <button class="remove-column-btn" onclick={() => confirmDeleteIndex = i} title="Remove column">×</button>
            {/if}
            <select class="column-select" onchange={(event) => handleColumnChange(i, event)}>
              {#each allUserLists as list (list.id)}
                <option value={list.id} selected={list.id === column.listId} disabled={shownListIds.has(list.id) && list.id !== column.listId}>
                  {list.displayName}
                </option>
              {/each}
            </select>
            <span class="task-count">({column.tasks.length})</span>
          </div>
          <div class="tasks-list">
            {#each column.tasks as task (task.id)}
              <div class="task-card" 
                   class:is-moving={task.id === movingTaskId}
                   draggable={!task.recurrence}
                   ondragstart={(event) => handleDragStart(event, task)}>
                <h3 class="task-title">{task.title}</h3>
                {#if task.bodyPreview}
                  <p class="task-body">{task.bodyPreview}</p>
                {/if}
              </div>
            {/each}
          </div>
        </div>
      {/each}
      
      {#if availableListsToAdd.length > 0}
        <div class="add-column-wrapper">
          <button class="add-column-btn" onclick={addColumn}>
            + Add Column
          </button>
        </div>
      {:else if !showAddColumnInput && allUserLists.length > 0 }
        <div class="add-column-wrapper">
            <form class="add-column-form" onsubmit={handleAddColumnSubmit}>
                <input
                type="text"
                placeholder="New list name..."
                bind:value={newColumnName}
                class="add-column-input"
                autofocus
                />
                <button type="submit">Add</button>
                <button type="button" onclick={() => showAddColumnInput = false}>×</button>
            </form>
        </div>
      {/if}
    </div>
  {/if}
</div>

<style lang="scss">

</style>