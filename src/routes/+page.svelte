<script>
  import { onMount } from 'svelte';
  import { authState } from '$lib/auth.js';
  import { getKanbanData, createTask, deleteTask } from '$lib/graphService.js';

  // --- Svelte 5 State Management using Runes ---
  let kanbanColumns = $state({});
  let isLoading = $state(true);
  let isPolling = $state(false); // Prevents multiple polls from running at the same time
  const pollingFreq = 5000;
  let error = $state(null);
  let movingTaskId = $state(null); // Used to show a loading state on the specific card being moved

  /**
   * Fetches data from the Graph API and populates the board.
   * @param {boolean} isInitialLoad - If true, it will show the main loading indicator.
   */
  async function loadBoard(isInitialLoad = false) {
    if (isPolling && !isInitialLoad) return; 

    if (isInitialLoad) {
      isLoading = true;
    }
    isPolling = true;
    error = null;

    try {
      kanbanColumns = await getKanbanData();
      console.log("Board data loaded:", kanbanColumns);
    } catch (e) {
      console.error('Failed to load board:', e);
      error = e.message || 'Failed to load tasks. Ensure you are logged in and have created the required lists in Microsoft To Do.';
    } finally {
      if (isInitialLoad) {
        isLoading = false;
      }
      isPolling = false;
    }
  }

  // --- Drag and Drop Logic ---

  /**
   * Sets ONLY the task ID to be transferred when the drag operation begins.
   * This is the most robust way to handle the data transfer, preventing stale state.
   * @param {DragEvent} event
   * @param {object} task - The task object being dragged.
   */
  function handleDragStart(event, task) {
    event.dataTransfer.setData('text/plain', task.id);
    event.dataTransfer.effectAllowed = 'move';
  }

  /**
   * Allows a drop to happen by preventing the default browser behavior.
   * @param {DragEvent} event
   */
  function handleDragOver(event) {
    event.preventDefault();
  }

  /**
   * Handles moving a task when it's dropped onto a new column by cloning and deleting.
   * @param {DragEvent} event
   * @param {string} destinationColumnName - The name of the column it was dropped on.
   */
  async function handleDrop(event, destinationColumnName) {
    event.preventDefault();
    const taskId = event.dataTransfer.getData('text/plain');
    if (!taskId) return;

    // At the moment of the drop, find the task and its source list using the transferred ID.
    let sourceColumnName = '';
    let sourceListId = null;
    let taskToMove = null;

    for (const [colName, colData] of Object.entries(kanbanColumns)) {
      const foundTask = colData.tasks.find(t => t.id === taskId);
      if (foundTask) {
        sourceColumnName = colName;
        sourceListId = colData.listId;
        taskToMove = foundTask;
        break;
      }
    }

    const destinationListId = kanbanColumns[destinationColumnName]?.listId;
    
    if (!taskToMove || !sourceListId || !destinationListId || sourceListId === destinationListId) {
      console.error("Drop cancelled: Invalid source, destination, or task.");
      return;
    }
    
    if (taskToMove.recurrence) {
      error = "Error: Cannot move a recurring task.";
      console.error("Attempted to move a recurring task, which is not supported.", taskToMove);
      return;
    }

    console.log(`--- Initiating Move (Clone & Delete) ---`);
    console.log(`Task: ${taskToMove.title} (ID: ${taskId})`);

    try {
      error = null;
      movingTaskId = taskId;

      // 1. Create a clone in the destination list.
      const newTask = await createTask(destinationListId, taskToMove);

      // 2. If clone is successful, delete the original task.
      await deleteTask(sourceListId, taskId);

      // 3. Update UI by replacing the old task with the new one.
      console.log("Move successful. Updating UI.");
      kanbanColumns[sourceColumnName].tasks = kanbanColumns[sourceColumnName].tasks.filter(t => t.id !== taskId);
      kanbanColumns[destinationColumnName].tasks.push(newTask);

    } catch (err) {
        console.error("Failed to move task:", err);
        error = `Error: Could not move task. A full refresh will sync changes. ${err.message}`;
        await loadBoard(false);
    } finally {
        movingTaskId = null;
    }
  }

  onMount(() => {
    let pollingInterval;

    const setupPolling = () => {
      clearInterval(pollingInterval);
      pollingInterval = setInterval(() => {
        if (document.visibilityState === 'visible' && !isPolling) {
          console.log('Polling for task updates...');
          loadBoard(false);
        }
      }, pollingFreq);
    };

    if ($authState.isAuthenticated) {
      loadBoard(true);
      setupPolling();
    }

    return () => {
      clearInterval(pollingInterval);
    };
  });

  // --- Svelte 5 Reactive Effect ---
  // Replaces the $: block. This runs when the component mounts and
  // re-runs whenever the values inside it ($authState, kanbanColumns, isLoading) change.
  $effect(() => {
    if ($authState.isAuthenticated && Object.keys(kanbanColumns).length === 0 && !isLoading) {
      loadBoard(true);
    }
  });

</script>

<div class="kanban-container">
  {#if !$authState.isAuthenticated && !isLoading}
    <p class="info-message">Please log in to see your To Do tasks.</p>
  {:else if isLoading}
    <p class="loading-message">Loading Kanban board...</p>
  {:else if error}
    <div class="error-container">
        <p class="error-message">{error}</p>
        <p>Please ensure you have created lists named according to your configuration in Microsoft To Do.</p>
        <button onclick={() => loadBoard(true)}>Retry</button>
    </div>
  {:else if Object.keys(kanbanColumns).length === 0}
    <p class="info-message">Could not find any Kanban lists. Please check your `KANBAN_LIST_MAPPING` in `graphService.js` and ensure the lists exist in Microsoft To Do.</p>
  {:else}
    <div class="kanban-board">
      {#each Object.entries(kanbanColumns) as [columnName, columnData]}
        <div class="kanban-column"
             ondragover={handleDragOver}
             ondrop={(event) => handleDrop(event, columnName)}>
          <h2 class="column-title">{columnName} ({columnData.tasks.length})</h2>
          <div class="tasks-list">
            {#each columnData.tasks as task (task.id)}
              <div class="task-card" 
                   class:is-moving={task.id === movingTaskId}
                   draggable={!task.recurrence}
                   ondragstart={(event) => handleDragStart(event, task)}
                   title={task.recurrence ? 'Recurring tasks cannot be moved' : 'Drag to move this task'}>
                <h3 class="task-title">{task.title}</h3>
                {#if task.bodyPreview}
                  <p class="task-body">{task.bodyPreview}</p>
                {/if}
                {#if task.dueDateTime}
                  <p class="task-due-date">
                    Due: {new Date(task.dueDateTime.dateTime).toLocaleDateString()}
                  </p>
                {/if}
                 {#if task.recurrence}
                  <p class="task-recurring-badge">🔄 Recurring</p>
                {/if}
              </div>
            {/each}
          </div>
        </div>
      {/each}
    </div>
  {/if}
</div>

<style>
  /* ... (your existing styles remain the same) ... */
  .task-card {
    /* ... */
    position: relative;
    transition: opacity 0.3s ease-in-out, box-shadow 0.2s ease, transform 0.2s ease;
  }
  .task-card.is-moving {
      opacity: 0.5;
  }
  /* Style for non-draggable recurring tasks */
  .task-card[draggable="false"] {
    cursor: not-allowed;
    background-color: #f8f9fa;
  }
  .task-recurring-badge {
    font-size: 0.75em;
    font-weight: bold;
    color: #6c757d;
    position: absolute;
    top: 8px;
    right: 8px;
  }
  .kanban-container {
    width: 100%;
    padding: 10px;
    box-sizing: border-box;
  }
  .kanban-board {
    display: flex;
    flex-direction: row;
    overflow-x: auto;
    gap: 1rem;
    padding-bottom: 1rem;
    min-height: 70vh;
  }
  .kanban-column {
    flex: 0 0 300px;
    max-width: 300px;
    background-color: #f0f2f5;
    border-radius: 8px;
    padding: 0.5rem;
    display: flex;
    flex-direction: column;
    height: fit-content;
    max-height: 80vh;
    transition: background-color 0.2s ease-in-out;
  }
  .kanban-column:hover {
      background-color: #e9ecef; /* Slightly darker on hover */
  }
  .column-title {
    font-size: 1.2em;
    font-weight: bold;
    color: #343a40;
    padding: 0.5rem;
    margin: 0 0 0.5rem 0;
    border-bottom: 2px solid #e0e0e0;
    text-align: center;
  }
  .tasks-list {
    overflow-y: auto;
    flex-grow: 1;
    padding: 0.25rem;
  }
  .task-card:hover {
    box-shadow: 0 4px 8px rgba(0,0,0,0.1);
    transform: translateY(-2px);
  }
  .task-card:last-child {
    margin-bottom: 0;
  }
  .task-title {
    font-size: 1em;
    font-weight: 600;
    margin-top: 0;
    margin-bottom: 0.25rem;
    color: #495057;
  }
  .task-body {
    font-size: 0.9em;
    color: #6c757d;
    margin-bottom: 0.25rem;
    white-space: pre-wrap;
    word-break: break-word;
  }
  .task-due-date {
    font-size: 0.8em;
    color: #dc3545;
  }
  .info-message, .loading-message {
    text-align: center;
    padding: 2rem;
    font-size: 1.1em;
    color: #6c757d;
  }
  .error-container {
    text-align: center;
    padding: 2rem;
    color: #721c24;
    background-color: #f8d7da;
    border: 1px solid #f5c6cb;
    border-radius: 4px;
  }
  .error-container button {
    margin-top: 1rem;
    padding: 0.5rem 1rem;
    border: 1px solid #721c24;
    background-color: #f1c2c7;
    border-radius: 4px;
    cursor: pointer;
  }
  @media (max-width: 600px) {
    .kanban-column {
      flex: 0 0 250px;
      max-width: 250px;
    }
  }
</style>
