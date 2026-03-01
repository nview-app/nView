#include "../include/secure_memory_types.h"

namespace nview {

LockResult LockBuffer(uint8_t* data, size_t length) {
  (void)data;
  (void)length;
  return {true, false};
}

OpResult UnlockBuffer(uint8_t* data, size_t length) {
  (void)data;
  (void)length;
  return {true};
}

OpResult WipeBuffer(uint8_t* data, size_t length) {
  if (data == nullptr || length == 0) {
    return {true};
  }

  volatile uint8_t* p = data;
  for (size_t i = 0; i < length; ++i) {
    p[i] = 0;
  }

  return {true};
}

}  // namespace nview
