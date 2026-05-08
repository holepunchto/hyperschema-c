cmake_minimum_required(VERSION 3.25)

find_package(cmake-fetch REQUIRED PATHS node_modules/cmake-fetch)

project(schema_test C)

add_subdirectory(schema)

add_executable(schema_test main.c)

set_target_properties(
  schema_test
  PROPERTIES
  C_STANDARD 99
)

target_link_libraries(schema_test PRIVATE schema)
