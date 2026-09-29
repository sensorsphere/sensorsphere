import React from "react";
import {
  Alert,
  Badge,
  Button,
  Card,
  Group,
  Modal,
  Select,
  Stack,
  Table,
  Text,
  TextInput,
  Title
} from "@mantine/core";
import {
  useMutation,
  useQuery,
  useQueryClient
} from "@tanstack/react-query";

import {
  addDevUserIdentity,
  approveUser,
  createDevPendingUser,
  disableUser,
  enableUser,
  getAuthAudit,
  getUsers,
  oidcLinkUrl,
  rejectUser,
  setUserRole,
  unlinkUserIdentity
} from "./api";
import type {
  IdentityProvider,
  SensorSphereRole,
  SensorSphereUser
} from "./types";

export function UsersPanel({
  devMode,
  authEnabled,
  currentUserId,
  enabledProviders,
  pendingFilterRequest = 0
}: {
  devMode: boolean;
  authEnabled: boolean;
  currentUserId: string | null;
  enabledProviders: IdentityProvider[];
  pendingFilterRequest?: number;
}) {
  const [email, setEmail] = React.useState("");
  const [roleFilter, setRoleFilter] = React.useState<string | null>("all");
  const [statusFilter, setStatusFilter] = React.useState<string | null>("all");

  React.useEffect(() => {
    if (pendingFilterRequest > 0) setStatusFilter("pending");
  }, [pendingFilterRequest]);
  const [identityUserId, setIdentityUserId] =
    React.useState<string | null>(null);
  const [identityProvider, setIdentityProvider] =
    React.useState<IdentityProvider>("google");
  const [identitySubject, setIdentitySubject] = React.useState("");
  const [identityTenant, setIdentityTenant] = React.useState("");
  const [identityEmail, setIdentityEmail] = React.useState("");
  const queryClient = useQueryClient();

  const usersQuery = useQuery({
    queryKey: ["admin-users"],
    queryFn: getUsers
  });
  const auditQuery = useQuery({
    queryKey: ["auth-audit"],
    queryFn: getAuthAudit
  });

  const refresh = async () => {
    await Promise.all([
      usersQuery.refetch(),
      auditQuery.refetch(),
      queryClient.invalidateQueries({
        queryKey: ["admin-user-summary"]
      })
    ]);
  };

  const approveMutation = useMutation({
    mutationFn: approveUser,
    onSuccess: refresh
  });
  const rejectMutation = useMutation({
    mutationFn: rejectUser,
    onSuccess: refresh
  });
  const disableMutation = useMutation({
    mutationFn: disableUser,
    onSuccess: refresh
  });
  const enableMutation = useMutation({
    mutationFn: enableUser,
    onSuccess: refresh
  });
  const roleMutation = useMutation({
    mutationFn: ({
      id,
      role
    }: {
      id: string;
      role: SensorSphereRole;
    }) => setUserRole(id, role),
    onSuccess: refresh
  });
  const createMutation = useMutation({
    mutationFn: () => createDevPendingUser(email),
    onSuccess: async () => {
      setEmail("");
      await refresh();
    }
  });
  const identityMutation = useMutation({
    mutationFn: () => {
      if (!identityUserId) {
        throw new Error("No user selected");
      }
      return addDevUserIdentity(
        identityUserId,
        {
          provider: identityProvider,
          providerSubject: identitySubject,
          providerTenant:
            identityProvider === "microsoft"
              ? identityTenant || null
              : null,
          providerEmail: identityEmail || null
        }
      );
    },
    onSuccess: async () => {
      setIdentitySubject("");
      setIdentityTenant("");
      setIdentityEmail("");
      await refresh();
    }
  });

  const unlinkMutation = useMutation({
    mutationFn: ({
      userId,
      provider,
      subject
    }: {
      userId: string;
      provider: IdentityProvider;
      subject: string;
    }) => unlinkUserIdentity(userId, provider, subject),
    onSuccess: refresh
  });

  const users = (usersQuery.data ?? []).filter(user =>
    (roleFilter === "all" || user.role === roleFilter) &&
    (statusFilter === "all" || user.status === statusFilter)
  );

  const identityUser =
    usersQuery.data?.find(user => user.id === identityUserId)
    ?? null;

  const mutationError =
    approveMutation.error ||
    rejectMutation.error ||
    disableMutation.error ||
    enableMutation.error ||
    roleMutation.error ||
    createMutation.error ||
    identityMutation.error ||
    unlinkMutation.error;
  return (
    <Stack gap="md">
      <Group justify="space-between" align="end">
        <div>
          <Title order={3}>Administration · Users</Title>
          <Text size="sm" c="dimmed">
            Manage roles, access status and external login identities.
          </Text>
        </div>
        <Group gap="xs">
          <Select
            label="Role"
            value={roleFilter}
            onChange={setRoleFilter}
            allowDeselect={false}
            data={[
              { value: "all", label: "All roles" },
              { value: "admin", label: "Admin" },
              { value: "user", label: "User" }
            ]}
          />
          <Select
            label="Status"
            value={statusFilter}
            onChange={setStatusFilter}
            allowDeselect={false}
            data={[
              { value: "all", label: "All statuses" },
              { value: "pending", label: "Pending" },
              { value: "active", label: "Active" },
              { value: "disabled", label: "Disabled" },
              { value: "rejected", label: "Rejected" }
            ]}
          />
        </Group>
      </Group>

      {devMode && (
        <Card withBorder>
          <Stack gap="sm">
            <Text fw={600}>DEV test user</Text>
            <Text size="sm" c="dimmed">
              Creates a pending account for approval and role-management tests.
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
      {(usersQuery.error || mutationError) && (
        <Alert color="red" title="User management error">
          {(usersQuery.error || mutationError)?.message}
        </Alert>
      )}

      <Card withBorder p={0}>
        <Table striped highlightOnHover verticalSpacing="sm">
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Account</Table.Th>
              <Table.Th>Role</Table.Th>
              <Table.Th>Status</Table.Th>
              <Table.Th>Identities</Table.Th>
              <Table.Th>Last login</Table.Th>
              <Table.Th>Actions</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {users.map(user => (
              <Table.Tr key={user.id}>
                <Table.Td>
                  <Stack gap={2}>
                    <Group gap="xs">
                      <Text size="sm">{user.email}</Text>
                      {user.isBootstrapAdmin && (
                        <Badge size="xs" color="violet" variant="light">
                          Bootstrap admin
                        </Badge>
                      )}
                    </Group>
                    {user.displayName && (
                      <Text size="xs" c="dimmed">
                        {user.displayName}
                      </Text>
                    )}
                    <Text size="xs" c="dimmed">
                      Created {new Date(user.createdAt).toLocaleString()}
                    </Text>
                  </Stack>
                </Table.Td>
                <Table.Td>
                  <Select
                    size="xs"
                    w={110}
                    value={user.role}
                    disabled={user.isBootstrapAdmin || roleMutation.isPending}
                    allowDeselect={false}
                    data={[
                      { value: "user", label: "User" },
                      { value: "admin", label: "Admin" }
                    ]}
                    onChange={value => {
                      if (value === "admin" || value === "user") {
                        roleMutation.mutate({
                          id: user.id,
                          role: value
                        });
                      }
                    }}
                  />
                </Table.Td>
                <Table.Td>
                  <Badge
                    color={
                      user.status === "active"
                        ? "green"
                        : user.status === "pending"
                          ? "yellow"
                          : user.status === "disabled"
                            ? "gray"
                            : "red"
                    }
                    variant="light"
                  >
                    {user.status}
                  </Badge>
                </Table.Td>
                <Table.Td>
                  <Button
                    size="compact-xs"
                    variant="subtle"
                    onClick={() => setIdentityUserId(user.id)}
                  >
                    {user.identities.length} · Manage
                  </Button>
                </Table.Td>
                <Table.Td>
                  <Text size="xs">
                    {user.lastLoginAt
                      ? new Date(user.lastLoginAt).toLocaleString()
                      : "Never"}
                  </Text>
                </Table.Td>
                <Table.Td>
                  <Group gap="xs">
                    {user.status === "pending" && (
                      <>
                        <Button
                          size="compact-xs"
                          onClick={() => approveMutation.mutate(user.id)}
                        >
                          Approve
                        </Button>
                        <Button
                          size="compact-xs"
                          color="red"
                          variant="light"
                          onClick={() => rejectMutation.mutate(user.id)}
                        >
                          Reject
                        </Button>
                      </>
                    )}
                    {user.status === "active" && !user.isBootstrapAdmin && (
                      <Button
                        size="compact-xs"
                        color="gray"
                        variant="light"
                        onClick={() => disableMutation.mutate(user.id)}
                      >
                        Disable
                      </Button>
                    )}
                    {(user.status === "disabled" ||
                      user.status === "rejected") && (
                      <Button
                        size="compact-xs"
                        variant="light"
                        onClick={() => enableMutation.mutate(user.id)}
                      >
                        Enable
                      </Button>
                    )}
                  </Group>
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </Card>
      <Card withBorder>
        <Stack gap="xs">
          <Text fw={600}>Recent authentication audit</Text>
          {(auditQuery.data ?? []).slice(0, 12).map(entry => (
            <Group
              key={entry.id}
              justify="space-between"
              gap="sm"
              wrap="nowrap"
            >
              <Text size="xs">{entry.action}</Text>
              <Text size="xs" c="dimmed">
                {new Date(entry.createdAt).toLocaleString()}
              </Text>
            </Group>
          ))}
          {(auditQuery.data?.length ?? 0) === 0 && (
            <Text size="xs" c="dimmed">No audit events yet.</Text>
          )}
        </Stack>
      </Card>

      <Modal
        opened={identityUser !== null}
        onClose={() => setIdentityUserId(null)}
        title={
          identityUser
            ? `Login identities · ${identityUser.email}`
            : "Login identities"
        }
        size="lg"
      >
        {identityUser && (
          <Stack gap="md">
            {identityUser.identities.map(identity => (
              <Card
                key={`${identity.provider}:${identity.providerSubject}`}
                withBorder
                p="sm"
              >
                <Group justify="space-between" align="start">
                  <Stack gap={2}>
                    <Group gap="xs">
                      <Badge variant="light">{identity.provider}</Badge>
                      <Text size="sm">
                        {identity.providerEmail ?? "No provider email"}
                      </Text>
                    </Group>
                    <Text size="xs" c="dimmed">
                      Subject: {identity.providerSubject}
                    </Text>
                    {identity.providerTenant && (
                      <Text size="xs" c="dimmed">
                        Tenant: {identity.providerTenant}
                      </Text>
                    )}
                  </Stack>
                  <Button
                    size="compact-xs"
                    color="red"
                    variant="subtle"
                    onClick={() =>
                      unlinkMutation.mutate({
                        userId: identityUser.id,
                        provider: identity.provider,
                        subject: identity.providerSubject
                      })
                    }
                  >
                    Unlink
                  </Button>
                </Group>
              </Card>
            ))}

            {identityUser.identities.length === 0 && (
              <Text size="sm" c="dimmed">
                No external login identities linked yet.
              </Text>
            )}

            {authEnabled && identityUser.id === currentUserId && (
              <Card withBorder>
                <Stack gap="sm">
                  <Text fw={600}>Link another sign-in identity</Text>
                  <Text size="sm" c="dimmed">
                    The new provider account will be linked only after a
                    successful OIDC sign-in while this session remains active.
                  </Text>
                  <Group gap="xs">
                    {enabledProviders.includes("google") && (
                      <Button
                        component="a"
                        href={oidcLinkUrl("google")}
                        variant="light"
                      >
                        Link Google identity
                      </Button>
                    )}
                    {enabledProviders.includes("microsoft") && (
                      <Button
                        component="a"
                        href={oidcLinkUrl("microsoft")}
                        variant="light"
                      >
                        Link Microsoft identity
                      </Button>
                    )}
                  </Group>
                </Stack>
              </Card>
            )}

            {devMode && (
              <Card withBorder>
                <Stack gap="sm">
                  <Text fw={600}>DEV · Link test identity</Text>
                  <Select
                    label="Provider"
                    value={identityProvider}
                    allowDeselect={false}
                    data={[
                      { value: "google", label: "Google" },
                      { value: "microsoft", label: "Microsoft" }
                    ]}
                    onChange={value => {
                      if (value === "google" || value === "microsoft") {
                        setIdentityProvider(value);
                      }
                    }}
                  />
                  <TextInput
                    label="Provider subject"
                    description={
                      identityProvider === "microsoft"
                        ? "Use the canonical tenant + oid identity value for tests."
                        : "Use the Google OIDC sub claim."
                    }
                    value={identitySubject}
                    onChange={event =>
                      setIdentitySubject(event.currentTarget.value)
                    }
                  />
                  {identityProvider === "microsoft" && (
                    <TextInput
                      label="Microsoft tenant (tid)"
                      value={identityTenant}
                      onChange={event =>
                        setIdentityTenant(event.currentTarget.value)
                      }
                    />
                  )}
                  <TextInput
                    label="Provider email"
                    value={identityEmail}
                    onChange={event =>
                      setIdentityEmail(event.currentTarget.value)
                    }
                  />
                  <Button
                    onClick={() => identityMutation.mutate()}
                    disabled={!identitySubject.trim()}
                    loading={identityMutation.isPending}
                  >
                    Link identity
                  </Button>
                </Stack>
              </Card>
            )}
          </Stack>
        )}
      </Modal>
    </Stack>
  );
}
