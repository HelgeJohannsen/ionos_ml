import { getCheckout, getCheckoutByOrderId } from "../../../models/checkout.server";
import { z } from "zod"
import { getConsorsClient } from "../../consors/api";

import { createShopifyOrderCancelUnhandled } from "~/models/ShopifyOrderCancel.server";

const orderCreated = z.object({
  id: z.number(),
  admin_graphql_api_id: z.string(),
  current_total_price: z.string(),
  tags: z.string()
})

  
export async function webbhook_oredersCancel(shop: string, payload: unknown){
  const data = payload?.valueOf()
  const orderData = orderCreated.parse(data)
  console.log("parsed oderData", orderData)
  if(orderData.tags.includes('Consors Finanzierung')){
    console.log("Cancel order because it is Consors Finanzierung:", orderData)
  const createdShopifyOrderCancelUnhandled = await createShopifyOrderCancelUnhandled(shop, orderData.id, orderData.admin_graphql_api_id, orderData.current_total_price)
  console.log("createdShopifyOrderCanceldUnhandled", createdShopifyOrderCancelUnhandled)
  }
}

interface OrderQueueEntry{
  orderId: bigint
  shop: string
  admin_graphql_api_id: string;
  current_total_price: string;
  createdAt: Date;
}

export async function handleOrderCancelQueue({shop, orderId, admin_graphql_api_id }: OrderQueueEntry){
  console.log("handling orderCancelQueue Entry")
  const oderId = BigInt(admin_graphql_api_id.split("Order/")[1])
  console.log("orderId from db", oderId)
  const checkout = await getCheckoutByOrderId(oderId)
  if(checkout == null){
    console.error("no checkout with given uuid in database", oderId)
    return undefined
  }

  //const transactionId = await getTransactionId(shop, admin_graphql_api_id)
  if(checkout.transaction_id != undefined){
    const transaction_id = checkout.transaction_id
    const response = await getConsorsClient(shop)
      .then(consorsClient => consorsClient?.stornoOrder(transaction_id))
      if(response === undefined){
        console.error(`No consors Client for shop ${shop}`)  
        return false
      }else if(response.status != 200){
      console.error(`non 200 response(${response.status}) from consorsApi.CancelOrder : `, response.text())
      return false
    }else{
      return true
    }
  }else{
    console.error("no transaction id in metafield for ", admin_graphql_api_id)
  }
}
