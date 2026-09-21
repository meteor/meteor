//go:build unix

package main

import (
	"os"
	"syscall"
)

func readMappedFile(path string) ([]byte, func() error, error) {
	file, err := os.Open(path)
	if err != nil {
		return nil, nil, err
	}
	defer file.Close()

	info, err := file.Stat()
	if err != nil {
		return nil, nil, err
	}
	if info.Size() == 0 {
		return []byte{}, func() error { return nil }, nil
	}

	data, err := syscall.Mmap(int(file.Fd()), 0, int(info.Size()), syscall.PROT_READ, syscall.MAP_PRIVATE)
	if err != nil {
		return nil, nil, err
	}

	return data, func() error { return syscall.Munmap(data) }, nil
}
