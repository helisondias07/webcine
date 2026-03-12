import React, { useState } from "react";
import { Button } from "@mantine/core";
import { InviteModal } from "../Modal/InviteModal";
import { IconUserPlus } from "@tabler/icons-react";

export const InviteButton = ({ className }: { className?: string }) => {
  const [inviteModalOpen, setInviteModalOpen] = useState(false);

  return (
    <>
      {inviteModalOpen && (
        <InviteModal closeInviteModal={() => setInviteModalOpen(false)} />
      )}
      <Button
        color="grey"
        leftSection={<IconUserPlus />}
        className={className}
        title="Convidar pessoas"
        onClick={() => setInviteModalOpen(true)}
      >
        Convidar pessoas
      </Button>
    </>
  );
};
