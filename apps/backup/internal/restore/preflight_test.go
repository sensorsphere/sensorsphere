package restore

import "testing"

func TestErrorCode(t *testing.T) {
	err := &Error{Code: 20, Err: errText("bad bundle")}
	if got := ErrorCode(err); got != 20 {
		t.Fatalf("expected 20, got %d", got)
	}
}

type errText string

func (e errText) Error() string { return string(e) }

func TestModes(t *testing.T) {
	if ModeData != "data" || ModeFull != "full" {
		t.Fatalf("unexpected restore mode constants")
	}
}
