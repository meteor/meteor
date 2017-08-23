COFFEESCRIPT_EXPORTED = 123
COFFEESCRIPT_EXPORTED_ONE_MORE = 234

# Having backticks in the code is required to trigger Babel processing
# the file and re-wrapping the list of defined variables.
`COFFEESCRIPT_EXPORTED_WITH_BACKTICKS = 345`

# Defining a class which extends a new class forces CoffeeScript
# to define an "extend" function, which then in turn forces Babel
# to re-wrap the list of defined variables so that each is defined
# in its own line.

class TestClass

class ClassExtending extends TestClass
