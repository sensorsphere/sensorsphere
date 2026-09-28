import React from "react";
import {
  Alert,
  Badge,
  Button,
  Card,
  Group,
  Stack,
  Table,
  Text,
  TextInput,
  Title
} from "@mantine/core";
import {
  useMutation,
  useQuery
} from "@tanstack/react-query";

import {
  approveUser,
  createDevPendingUser,
  getUsers
} from "./api";

export function UsersPanel({
  devMode
}: {
  devMode: boolean;
}) {
  const [email, setEmail] = React.useState("");
  const usersQuery = useQuery({
    queryKey: ["admin-users"],
    queryFn: getUsers
  });

  const approveMutation = useMutation({
    mutationFn: approveUser,
    onSuccess: () => usersQuery.refetch()
  });

  const createMutation = useMutation({
    mutationFn: () => createDevPendingUser(email),
    onSuccess: () => {
      setEmail("");
      usersQuery.refetch();
    }
  });

  return (
    <Stack gap="md">
      <Group justify="space-between">
        <div>
          <Title order={3}>Administration · Users</Title>
          <Text size="sm" c="dimmed">
            Only administrators can approve pending users.
          </Text>
        </div>
      </Group>
      {devMode && (
        <Card withBorder>
          <Stack gap="sm">
            <Text fw={600}>DEV test user</Text>
            <Text size="sm" c="dimmed">
              Create a pending user to validate the approval workflow.
            </Text>
            <Group align="end">
              <TextInput
                label="Email"
                placeholder="user@example.com"
                value={email}
                onChange={event => setEmail(event.currentTarget.value)}
                style={{ flex: 1 }}
              />
              <Button
                onClick={() => createMutation.mutate()}
                loading={createMutation.isPending}
                disabled={!email.trim()}
              >
                Create pending user
              </Button>
            </Group>
          </Stack>
        </Card>
      )}
      {usersQuery.error && (
        <Alert color="red" title="Unable to load users">
          {usersQuery.error.message}
        </Alert>
      )}

      <Card withBorder p={0}>
        <Table striped highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Email</Table.Th>
              <Table.Th>Role</Table.Th>
              <Table.Th>Status</Table.Th>
              <Table.Th>Created</Table.Th>
              <Table.Th>Actions</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {(usersQuery.data ?? []).map(user => (
              <Table.Tr key={user.id}>
                <Table.Td>{user.email}</Table.Td>
                <Table.Td>
                  <Badge variant="light">
                    {user.role}
                  </Badge>
                </Table.Td>
                <Table.Td>
                  <Badge
                    color={user.status === "active" ? "green" : "yellow"}
                    variant="light"
                  >
                    {user.status}
                  </Badge>
                </Table.Td>
                <Table.Td>
                  {new Date(user.createdAt).toLocaleString()}
                </Table.Td>
                <Table.Td>
                  <Button
                    size="xs"
                    disabled={user.status !== "pending"}
                    loading={
                      approveMutation.isPending &&
                      approveMutation.variables === user.id
                    }
                    onClick={() => approveMutation.mutate(user.id)}
                  >
                    Approve
                  </Button>
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </Card>
    </Stack>
  );
}
