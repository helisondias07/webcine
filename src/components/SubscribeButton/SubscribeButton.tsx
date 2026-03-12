import React, { useContext, useState } from "react";
import { Button } from "@mantine/core";
import { SubscribeModal } from "../Modal/SubscribeModal";
import { MetadataContext } from "../../MetadataContext";
import { IconStarFilled } from "@tabler/icons-react";
import { t } from "../../i18n";

export const SubscribeButton = () => {
  const { isSubscriber } = useContext(MetadataContext);
  const [isSubscribeModalOpen, setIsSubscribeModalOpen] = useState(false);
  if (isSubscriber === undefined || isSubscriber) {
    return null;
  }
  return (
    <>
      {isSubscribeModalOpen && (
        <SubscribeModal closeSubscribe={() => setIsSubscribeModalOpen(false)} />
      )}
      <Button
        leftSection={<IconStarFilled />}
        color="webgold"
        onClick={() => setIsSubscribeModalOpen(true)}
      >
        {t("subscribe")}
      </Button>
    </>
  );
};
