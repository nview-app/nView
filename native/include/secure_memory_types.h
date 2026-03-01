#ifndef NVIEW_SECURE_MEMORY_TYPES_H
#define NVIEW_SECURE_MEMORY_TYPES_H

#include <cstddef>
#include <cstdint>

namespace nview {

struct LockResult {
  bool ok;
  bool locked;
};

struct OpResult {
  bool ok;
};

LockResult LockBuffer(uint8_t* data, size_t length);
OpResult UnlockBuffer(uint8_t* data, size_t length);
OpResult WipeBuffer(uint8_t* data, size_t length);

}  // namespace nview

#endif
