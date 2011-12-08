Todos = Sky.Collection("todos");
Todos.schema({text: String, done: Boolean, order: Number});

Sky.publish('todos');
