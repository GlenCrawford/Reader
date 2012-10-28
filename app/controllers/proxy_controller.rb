class ProxyController < ApplicationController
  def get
    response = HTTParty.get(params[:url], :headers => {
      "Authorization" => "GoogleLogin auth=#{cookies[:auth]}"
    })
    render :layout => false, :status => response.response.code.to_i, :text => response.body
  end

  def post
    headers = {}
    headers["Authorization"] = "GoogleLogin auth=#{cookies[:auth]}" if cookies[:auth]

    response = HTTParty.post(params[:url], :body => filtered_params, :headers => headers)

    # If this is a Google ClientLogin request, get the "Auth" token from the response
    # body and store it in a cookie.
    if params[:url].include?("ClientLogin")
      cookies[:auth] = response.body.split("Auth=").last.strip
    end

    render :layout => false, :status => response.response.code.to_i, :text => response.body
  end

  private

  def filtered_params
    (params.symbolize_keys.keys - [:controller, :action, :url]).inject({}) do |hash, param|
      hash[param] = params[param]
      hash
    end
  end
end
