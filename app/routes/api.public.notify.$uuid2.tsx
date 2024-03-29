import type { LoaderArgs } from "@remix-run/node";
import {
  getCheckout,
  createCheckoutState,
  checkoutAddTransactionId,
  getCheckoutByTransactionId,
  createCheckoutByOrderID,
} from "../models/checkout.server";
import {
  checkNotifyHash,
  consorsNotification,
} from "../utils/consors/notification";
import { z } from "zod";
import { authenticate } from "../shopify.server";
import { orderMarkAsPaid } from "~/utils/graphql/markAsPaid";
import { addTags } from "~/utils/graphql/order";
import { checkIfOrderExists } from "~/utils/graphql/order";

export async function action({ request, params }: LoaderArgs) {
  /**
   * Called by consors to signal signal sucess or failure of a finance request
   */

   console.log("notify Request:", request.url);

  //TODO: is it necessary to validate request.method ?

  /*   let valideNotify = checkNotifyHash(request.url)   // TODO: request.url might have wrong protocol ( http:// instead of https:// )
  if(!valideNotify){
    if(request.url.startsWith("http://")){
      const modifiedUrl = "https"+request.url.substring("http".length)
      valideNotify = checkNotifyHash(modifiedUrl)
    }
  }
  if(!valideNotify){
    throw new Response("could not validate request", {status:401})  
  } */

  const checkoutByUUID = await getCheckout(params.uuid!); // TODO: is it valide to assume uuid is present on this Route ?
  const shop = process.env.SHOPIFY_SHOP
  if(!shop){
    console.log("shop undefined")
  }
  const orderID = params.uuid!
  if (!checkoutByUUID) {
    console.log("orderID:", orderID)
   // const orderExists = await checkIfOrderExists(shop,orderID)
    // notification for a non existing checkout
    // console.log("checkout not found");
    const orderExists = true
    if(orderExists){
      const orderId = Number(params.uuid)
      createCheckoutByOrderID(shop!,params.uuid!, orderId)
      console.log("new Checkout created from notification")
    }

  }
  const checkout = await getCheckout(params.uuid!); // TODO: is it valide to assume uuid is present on this Route ?
  
  if(checkout == null){
    throw new Response("Not Found", {
      status: 404,
    });
  }

  const requestedURL = new URL(request.url);

  const searchParams = [...requestedURL.searchParams.entries()];
  // console.log("searchParams:", searchParams);

  const nonEmptySearchParams = searchParams.filter(
    ([_name, value]) => value.length > 0
  );
  let notification: z.infer<typeof consorsNotification>;


  try {
    const obj = Object.fromEntries(nonEmptySearchParams);
    // console.log(obj);
    const result = consorsNotification.safeParse(obj);
    if (result.success) {
      notification = result.data;
    } else {
      return new Response("not OK", {
        status: 400,
      });
    }
  } catch (error) {
    console.error(error);
    return new Response("not OK", {
      status: 400,
    });
  }

  if(checkout.transaction_id == null){
    await checkoutAddTransactionId(checkout.uuid, notification.transaction_id!);
  }
  if (notification.status == "error") {
    const error = await createCheckoutState(
      checkout,
      notification.status_detail!,
      request.url,
      notification.creditAmount
    );
    if (notification.status_detail === "CANCELLED") {
      const shopifyGid = "gid://shopify/Order/" + notification.order_id;
      addTags(checkout.shop, shopifyGid, "Cancelled");
    }
  } else if (notification.status == "proposal") {
    await checkoutAddTransactionId(checkout.uuid, notification.transaction_id!);

    const created = await createCheckoutState(
      checkout,
      notification.status,
      request.url,
      notification.creditAmount
    ); // TODO; request url zu lang für db
    // console.log("created", created);
    // console.log(notification);
  } else if (notification.status === "accepted") {
    console.log(
      "notification.status:accepted, orderid;",
      notification.order_id
    );
    orderMarkAsPaid(notification, request);
  } else if (notification.status === "error_declined") {
    // console.log(
    //   "notification.status:error_declined, orderid;",
    //   notification.order_id
    // );
    const shopifyGid = "gid://shopify/Order/" + notification.order_id;
    addTags(checkout.shop, shopifyGid, "error_declined");
  } else if (notification.status === "error_cancelled") {
    // console.log(
    //   "notification.status:error_declined, orderid;",
    //   notification.order_id
    // );
    const shopifyGid = "gid://shopify/Order/" + notification.order_id;
    addTags(checkout.shop, shopifyGid, "error_cancelled");
  }
  // console.log(notification.status);
  return new Response("OK", {
    status: 200,
  });
}