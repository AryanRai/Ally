package dev.ally.device

import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch

/** Owns a controller per chat. Selecting changes only the visible projection;
 * jobs, request receipts and approvals remain with the originating controller. */
class ChatWorkspace<T, S>(private val scope: CoroutineScope, initial: String,
    private val create: (String) -> T, private val stateOf: (T) -> StateFlow<S>) {
    private val chats = mutableMapOf<String, T>()
    var selected: String = initial; private set
    val current: T get() = chats.getValue(selected)
    val controllers: Collection<T> get() = chats.values.distinct()
    val state: MutableStateFlow<S>
    private var observer: Job? = null
    init { chats[initial] = create(initial); state = MutableStateFlow(stateOf(current).value); observe() }
    fun restore(ids: Collection<String>) { ids.filter { it != selected }.forEach { id -> chats.getOrPut(id) { create(id) } } }
    fun alias(id: String) {
        if (id == selected) return
        observer?.cancel()
        chats[id] = current
        selected = id
        observe()
    }
    fun open(id: String) {
        if (id == selected) return
        observer?.cancel()
        chats.getOrPut(id) { create(id) }
        selected = id
        state.value = stateOf(current).value
        observe()
    }
    private fun observe() {
        val id = selected
        val source = stateOf(current)
        observer = scope.launch { source.collect { if (selected == id) state.value = it } }
    }
}
