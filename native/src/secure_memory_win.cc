#ifdef _WIN32

#include <windows.h>
#include <winternl.h>

#include "../include/secure_memory_types.h"

namespace nview {

LockResult LockBuffer(uint8_t* data, size_t length) {
  if (data == nullptr || length == 0) {
    return {true, false};
  }

  BOOL locked = VirtualLock(data, length);
  return {true, locked == TRUE};
}

OpResult UnlockBuffer(uint8_t* data, size_t length) {
  if (data == nullptr || length == 0) {
    return {true};
  }

  BOOL unlocked = VirtualUnlock(data, length);
  return {unlocked == TRUE};
}

OpResult WipeBuffer(uint8_t* data, size_t length) {
  if (data == nullptr || length == 0) {
    return {true};
  }

  RtlSecureZeroMemory(data, length);
  return {true};
}

}  // namespace nview

#endif
