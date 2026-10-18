// A module with every directive fundscan has to step over.
module example.com/go-fixture

go 1.24

toolchain go1.24.2

require github.com/spf13/cobra v1.10.1

require (
	github.com/BurntSushi/toml v1.5.0
	"golang.org/x/sys" v0.33.0
	github.com/go-chi/chi/v5 v5.2.1 // pinned for routing
	github.com/spf13/pflag v1.0.9 // indirect
)

require github.com/davecgh/go-spew v1.1.1 // indirect

replace (
	github.com/example/old => github.com/example/new v1.0.0
)

exclude github.com/example/bad v0.1.0

tool (
	golang.org/x/tools/cmd/stringer
)
